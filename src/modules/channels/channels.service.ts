import { plainToInstance } from 'class-transformer'
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { ChannelId } from 'src/common/types/channel-id.type'
import { UserId } from 'src/common/types/user-id.type'
import { CreateChannelDto } from './dto/create-channel.dto'
import { generateChannelId } from 'src/common/utils/id-generator.util'
import { ChannelResponseDto } from './dto/channel.dto'
import { SenderType } from 'generated/prisma/enums'
import { UpdateChannelDto } from './dto/update-channel.dto'
import { ChannelType, ConversationRole, ConversationType, Prisma } from 'generated/prisma/client'
import { ChatsService } from '../chats/chats.service'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SocketEvent } from 'src/common/socket/socket-events'
import { ChatResponseDto } from '../chats/dto/chat-response.dto'
import { MessageResponseDto } from '../messages/dto/message-response.dto'
import { SearchService } from '../search/search.service'
import { InviteLinksService } from '../chats/invite-links.service'
import { UserResponseDto } from '../users/dto/user-response.dto'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class ChannelsService {
	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly searchService: SearchService,
		private readonly inviteLinksService: InviteLinksService
	) {}

	async create(ownerId: UserId, dto: CreateChannelDto): Promise<ChannelResponseDto> {
		if (dto.username && dto.channelType === ChannelType.PUBLIC) {
			const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
			if (!isAvailable) throw new ConflictException('Username is already taken')
		}

		const channelId = generateChannelId()

		try {
			const channel = await this.prisma.$transaction(async (tx) => {
				const channel = await tx.channel.create({
					data: {
						id: channelId,
						name: dto.name,
						bio: dto.bio,
						ownerId: ownerId,
						channelType: dto.channelType,
						username: dto.channelType === ChannelType.PUBLIC ? dto.username : null
					}
				})

				await tx.sender.create({
					data: {
						id: channel.id,
						type: SenderType.CHANNEL,
						channelId: channel.id
					}
				})

				await tx.channelSubscriber.create({
					data: {
						userId: ownerId,
						channelId: channel.id
					}
				})

				const conversation = await tx.conversation.create({
					data: {
						type: ConversationType.CHANNEL,
						channelId: channel.id,
						createdAt: Date.now()
					}
				})

				await tx.conversationMember.create({
					data: {
						conversationId: conversation.id,
						userId: ownerId,
						role: ConversationRole.OWNER,
						joinedAt: Date.now()
					}
				})

				await this.chatsService.create(tx, ownerId, conversation.id)

				if (dto.channelType === ChannelType.PRIVATE) {
					await this.inviteLinksService.create(ownerId, { channelId: channel.id.toString() })
				}

				return channel
			})

			return this.getById(ChannelId(channel.id), ownerId)
		} catch (e) {
			if (e instanceof Prisma.PrismaClientKnownRequestError) {
				if (e.code === 'P2002') {
					throw new ConflictException('Username already exists')
				}
			}
			throw e
		}
	}

	async update(id: ChannelId, dto: UpdateChannelDto, userId: UserId): Promise<ChannelResponseDto> {
		const existingChannel = await this.prisma.channel.findUnique({ where: { id } })

		if (dto.username && dto.username !== existingChannel.username) {
			const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
			if (!isAvailable) throw new ConflictException('Username is already taken')
		}

		const channelType = dto.channelType ?? existingChannel.channelType
		const username =
			channelType === ChannelType.PRIVATE ? null : (dto.username ?? existingChannel.username)

		await this.prisma.channel.update({
			where: { id: id },
			data: {
				name: dto.name,
				bio: dto.bio,
				channelType: channelType,
				username: username
			}
		})
		return this.getById(id, userId)
	}

	async join(channelId: ChannelId, userId: UserId): Promise<void> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			include: { conversations: true }
		})

		if (channel.channelType !== ChannelType.PUBLIC) {
			throw new BadRequestException('This channel is private. Use invite link to join.')
		}

		const isBanned = await this.prisma.channelBlackList.count({
			where: { channelId, userId }
		})
		if (isBanned) throw new BadRequestException('You are banned from this channel')

		const conversation = channel.conversations[0]
		if (!conversation) throw new NotFoundException('Channel conversation not found')

		await this.prisma.$transaction(async (tx) => {
			const existingMember = await tx.channelSubscriber.findUnique({
				where: { userId_channelId: { userId, channelId } }
			})
			if (existingMember) return

			await tx.channelSubscriber.create({
				data: { channelId, userId }
			})

			await tx.conversationMember.create({
				data: {
					conversationId: conversation.id,
					userId,
					joinedAt: Date.now()
				}
			})

			await this.chatsService.create(tx, userId, conversation.id)
		})

		const lastMessage = await this.prisma.message.findFirst({
			where: { conversationId: conversation.id },
			orderBy: { sendTime: 'desc' }
		})

		const chatPayload = plainToInstance(ChatResponseDto, {
			id: channel.id.toString(),
			name: channel.name,
			isPinned: false,
			lastMessage: lastMessage
				? plainToInstance(MessageResponseDto, {
						...lastMessage,
						chatId: channel.id.toString()
					})
				: null
		})

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_NEW, chatPayload)
	}

	async leave(channelId: ChannelId, userId: UserId): Promise<void> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			include: { conversations: true }
		})
		if (channel.ownerId === userId)
			throw new BadRequestException('Owner cannot unsubscribe. Delete it instead.')

		const conversation = channel.conversations[0]

		await this.prisma.$transaction(async (tx) => {
			await tx.channelSubscriber
				.delete({
					where: { userId_channelId: { userId, channelId } }
				})
				.catch(() => {})

			if (conversation) {
				await tx.conversationMember
					.delete({
						where: { conversationId_userId: { conversationId: conversation.id, userId } }
					})
					.catch(() => {})

				await tx.chat.deleteMany({
					where: { userId, conversationId: conversation.id }
				})
			}
		})
	}

	async kick(id: ChannelId, ownerId: UserId, targetUserId: UserId): Promise<void> {
		if (targetUserId === ownerId) throw new BadRequestException('Cannot kick yourself')

		await this.leave(id, targetUserId)
	}

	async ban(id: ChannelId, ownerId: UserId, targetUserId: UserId): Promise<void> {
		if (targetUserId === ownerId) throw new BadRequestException('Cannot ban yourself')

		await this.prisma.$transaction(async (tx) => {
			await this.kick(id, ownerId, targetUserId)
			await tx.channelBlackList.upsert({
				where: { userId_channelId: { userId: targetUserId, channelId: id } },
				create: { userId: targetUserId, channelId: id },
				update: {}
			})
		})
	}

	async getById(channelId: ChannelId, userId: UserId): Promise<ChannelResponseDto> {
		const channel = await this.prisma.channel.findUnique({
			where: {
				id: channelId
			},
			include: {
				_count: {
					select: {
						subscribers: true,
						blockedUsers: true
					}
				},
				subscribers: {
					where: { userId },
					select: { userId: true }
				},
				conversations: {
					include: {
						inviteLinks: {
							take: 1
						}
					}
				}
			}
		})

		const isOwner = channel.ownerId == userId
		let inviteLinkCode = channel.conversations[0]?.inviteLinks[0]?.code

		if (channel.channelType === ChannelType.PRIVATE && !inviteLinkCode && isOwner) {
			const newLink = await this.inviteLinksService.create(userId, {
				channelId: channelId.toString()
			})
			inviteLinkCode = newLink.code
		}

		const inviteLink = inviteLinkCode
			? `https://${this.config.get('SHORT_URL_DOMAIN')}/+${inviteLinkCode}`
			: null

		return plainToInstance(ChannelResponseDto, {
			...channel,
			id: channel.id.toString(),
			isSubscribed: channel.subscribers.length > 0,
			isOwner,
			subscribers: channel._count.subscribers.toString(),
			removedUser: channel._count.blockedUsers.toString(),
			inviteLink
		})
	}

	async getSubscribers(
		channelId: ChannelId,
		skip: number,
		take: number,
		search?: string
	): Promise<UserResponseDto[]> {
		const where: Prisma.ChannelSubscriberWhereInput = {
			channelId,
			user: search
				? {
						OR: [
							{ firstName: { contains: search } },
							{ lastName: { contains: search } },
							{ username: { contains: search } }
						]
					}
				: undefined
		}

		const subscribers = await this.prisma.channelSubscriber.findMany({
			where,
			skip,
			take,
			include: {
				user: true
			},
			orderBy: {
				user: {
					firstName: 'asc'
				}
			}
		})

		return plainToInstance(
			UserResponseDto,
			subscribers.map((s) => s.user)
		)
	}

	async delete(id: ChannelId, userId: UserId): Promise<void> {
		const channel = await this.prisma.channel.findUnique({ where: { id } })
		if (!channel) throw new NotFoundException('Channel not found')
		if (channel.ownerId !== userId) throw new ForbiddenException('Only owner can delete channel')

		await this.prisma.channel.delete({ where: { id: id } })
	}

	async isExists(id: ChannelId): Promise<boolean> {
		return !!(await this.prisma.channel.findFirst({ where: { id } }))
	}

	async isOwner(channelId: ChannelId, userId: UserId): Promise<boolean> {
		return !!(await this.prisma.channel.findFirst({
			where: { id: channelId, ownerId: userId }
		}))
	}
}

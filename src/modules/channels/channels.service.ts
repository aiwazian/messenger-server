import { plainToInstance } from 'class-transformer'
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { CreateChannelDto } from './dto/create-channel.dto'
import { ChannelResponseDto } from './dto/channel.dto'
import { UpdateChannelDto } from './dto/update-channel.dto'
import { ChatsService } from '../chats/chats.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { ChatResponseDto } from '../chats/dto/chat-response.dto'
import { MessageResponseDto } from '../messages/dto/message-response.dto'
import { SearchService } from '../search/search.service'
import { UserResponseDto } from '../users/dto/user-response.dto'
import { ConfigService } from '@nestjs/config'
import { IsBannedDto } from './dto/is-banned.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChannelType, MessageType, SystemEventType } from '../../../generated/prisma/enums'
import { UserId } from '../../common/types/user-id.type'
import { generateChannelId } from '../../common/utils/id-generator.util'
import { ChannelId } from '../../common/types/channel-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { Prisma } from '../../../generated/prisma/client'
import { SocketEvent } from '../../common/socket/socket-events'
import { EncryptionService } from '../encryption/encryption.service'

@Injectable()
export class ChannelsService {
	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly searchService: SearchService,
		private readonly encryption: EncryptionService
	) { }

	async create(ownerId: UserId, dto: CreateChannelDto): Promise<ChannelResponseDto> {
		const channelId = generateChannelId()

		const channel = await this.prisma.channel.create({
			data: {
				id: channelId,
				name: dto.name,
				bio: dto.bio,
				ownerId: ownerId,
				channelType: ChannelType.PRIVATE,
				username: null,
				subscribers: {
					create: {
						userId: ownerId
					}
				}
			}
		})

		await this.chatsService.create(ownerId, ChatId(channel.id))

		await this.prisma.message.create({
			data: {
				chatId: channel.id,
				text: null,
				sendTime: Date.now(),
				sequenceId: BigInt(Date.now()),
				senderId: ownerId,
				messageType: MessageType.SYSTEM,
				encryptionKeyVersion: this.encryption.currentVersion,
				systemEvent: {
					create: {
						eventType: SystemEventType.CHANNEL_CREATED
					}
				}
			}
		})

		const chatPayload = plainToInstance(ChatResponseDto, {
			id: channel.id,
			name: channel.name,
			isPinned: false,
			lastMessage: null
		})

		this.realtimeGateway.sendToUser(ownerId, SocketEvent.CHAT_NEW, chatPayload)

		return this.getById(ChannelId(channel.id), ownerId)
	}

	async update(id: ChannelId, dto: UpdateChannelDto): Promise<ChannelResponseDto> {
		const exitingChannel = await this.prisma.channel.findUnique({ where: { id } })
		if (!exitingChannel) throw new NotFoundException('Channel not found')

		if (dto.username && dto.username !== exitingChannel.username) {
			const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
			if (!isAvailable) throw new ConflictException('Username is already taken')
		}

		const channelType = dto.channelType ?? exitingChannel.channelType
		const username = channelType === ChannelType.PRIVATE ? null : (dto.username ?? exitingChannel.username)

		const channel = await this.prisma.channel.update({
			where: { id },
			data: {
				name: dto.name,
				bio: dto.bio,
				channelType,
				username
			}
		})
		return plainToInstance(ChannelResponseDto, channel)
	}

	async join(channelId: ChannelId, userId: UserId): Promise<void> {
		const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
		if (!channel) throw new NotFoundException('Channel not found')

		if (channel.channelType !== ChannelType.PUBLIC) {
			throw new BadRequestException('This channel is private. Use invite link to join.')
		}

		const isBanned = await this.prisma.channelBlackList.count({
			where: { channelId, userId }
		})
		if (isBanned) throw new BadRequestException('You are banned from this channel')

		const existingMember = await this.prisma.channelSubscriber.findUnique({
			where: { userId_channelId: { userId, channelId } }
		})
		if (existingMember) return 

		await this.prisma.channelSubscriber.create({
			data: { channelId, userId }
		})

		this.chatsService.create(userId, ChatId(channelId))
		const lastMessage = await this.prisma.message.findFirst({
			where: { chatId: channelId },
			orderBy: { sendTime: 'desc' }
		})

		const chatPayload = plainToInstance(ChatResponseDto, {
			id: channel.id,
			name: channel.name,
			isPinned: false,
			lastMessage: plainToInstance(MessageResponseDto, lastMessage)
		})

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_NEW, chatPayload)
	}

	async leave(channelId: ChannelId, userId: UserId): Promise<void> {
		const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
		if (!channel) throw new NotFoundException('Channel not found')

		if (channel.ownerId === userId) throw new BadRequestException('Owner cannot unsubscribe. Delete it instead.')

		await this.prisma.$transaction(async (tx) => {
			await tx.channelSubscriber
				.delete({ where: { userId_channelId: { userId, channelId } } })
				.catch(() => { })

			await tx.chat.deleteMany({
				where: { userId, chatId: channelId }
			})
		})

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UPDATED, { chatId: channelId })
	}

	async kick(id: ChannelId, ownerId: UserId, targetUserId: UserId): Promise<void> {
		if (targetUserId === ownerId) throw new BadRequestException('Cannot kick yourself')

		await this.leave(id, targetUserId)

		this.realtimeGateway.sendToUser(targetUserId, SocketEvent.CHAT_REMOVED, { chatId: id })
	}

	async ban(id: ChannelId, ownerId: UserId, targetUserId: UserId): Promise<void> {
		if (targetUserId === ownerId) throw new BadRequestException('Cannot ban yourself')

		const channel = await this.prisma.channel.findUnique({ where: { id } })
		if (!channel) throw new NotFoundException('Channel not found')

		if (channel.ownerId === targetUserId) {
			throw new BadRequestException('Owner cannot unsubscribe. Delete it instead.')
		}

		await this.prisma.$transaction(async (tx) => {
			await tx.channelSubscriber
				.delete({ where: { userId_channelId: { userId: targetUserId, channelId: id } } })
				.catch(() => { })

			await tx.chat.deleteMany({
				where: { userId: targetUserId, chatId: id }
			})

			await tx.channelBlackList.upsert({
				where: { userId_channelId: { userId: targetUserId, channelId: id } },
				create: { userId: targetUserId, channelId: id },
				update: {}
			})
		})

		this.realtimeGateway.sendToUser(targetUserId, SocketEvent.CHAT_REMOVED, { chatId: id })
	}

	async getById(channelId: ChannelId, userId: UserId): Promise<ChannelResponseDto> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
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
				}
			}
		})

		if (!channel) throw new NotFoundException('Channel not found')

		const isOwner = channel.ownerId == userId

		return plainToInstance(ChannelResponseDto, {
			...channel,
			isSubscribed: channel.subscribers.length > 0,
			isOwner,
			subscribers: channel._count.subscribers,
			removedUser: channel._count.blockedUsers
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
			include: { user: true },
			orderBy: { user: { firstName: 'asc' } }
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

		await this.prisma.channel.delete({ where: { id } })
	}

	async isExists(id: ChannelId): Promise<boolean> {
		return !!(await this.prisma.channel.findFirst({ where: { id } }))
	}

	async isOwner(channelId: ChannelId, userId: UserId): Promise<boolean> {
		return !!(await this.prisma.channel.findFirst({
			where: { id: channelId, ownerId: userId }
		}))
	}

	async getBannedUsers(
		channelId: ChannelId,
		skip: number,
		take: number,
		search?: string
	): Promise<UserResponseDto[]> {
		const where: Prisma.ChannelBlackListWhereInput = {
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

		const bannedUsers = await this.prisma.channelBlackList.findMany({
			where,
			skip,
			take,
			include: { user: true },
			orderBy: { user: { firstName: 'asc' } }
		})

		return plainToInstance(
			UserResponseDto,
			bannedUsers.map((b) => b.user)
		)
	}

	async unban(id: ChannelId, ownerId: UserId, targetUserId: UserId): Promise<void> {
		if (targetUserId === ownerId) throw new BadRequestException('Cannot unban yourself')

		const deleted = await this.prisma.channelBlackList.deleteMany({
			where: { channelId: id, userId: targetUserId }
		})

		if (deleted.count === 0) {
			throw new NotFoundException('User is not banned from this channel')
		}
	}

	async isBanned(channelId: ChannelId, userId: UserId): Promise<IsBannedDto> {
		const bannedUser = await this.prisma.channelBlackList.findFirst({
			where: { channelId, userId }
		})
		return plainToInstance(IsBannedDto, { isBanned: bannedUser != null })
	}
}

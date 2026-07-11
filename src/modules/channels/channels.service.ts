import { plainToInstance } from 'class-transformer'
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
	Inject,
	forwardRef
} from '@nestjs/common'
import { ChannelResponseDto } from './dto/channel.dto'
import { UpdateChannelDto } from './dto/update-channel.dto'
import { ChatsService } from '../chats/chats.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { ChatResponseDto } from '../chats/dto/chat-response.dto'
import { MessageResponseDto } from '../messages/dto/message-response.dto'
import { SearchService } from '../search/search.service'
import { StorageService } from '../storage/storage.service'
import { UserResponseDto } from '../users/dto/user-response.dto'
import { IsBannedDto } from './dto/is-banned.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChannelType } from '../../../generated/prisma/enums'
import { UserId } from '../../common/types/user-id.type'
import { ChannelId } from '../../common/types/channel-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { Prisma } from '../../../generated/prisma/client'
import { SocketEvent } from '../../common/socket/socket-events'
import { randomBytes } from 'crypto'
import { CreateInviteLinkDto } from '../../common/dtos/create-invite-link.dto'
import { UpdateInviteLinkDto } from '../../common/dtos/update-invite-link.dto'
import { InviteLinkResponseDto } from '../invites/dto/invite-link-response.dto'
import { FileDownloadDto } from '../messages/dto/file-download.dto'

@Injectable()
export class ChannelsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly searchService: SearchService,
		private readonly storageService: StorageService
	) {}

	async update(id: ChannelId, dto: UpdateChannelDto): Promise<ChannelResponseDto> {
		const exitingChannel = await this.prisma.channel.findUnique({ where: { id } })
		if (!exitingChannel) throw new NotFoundException('Channel not found')

		if (dto.username && dto.username !== exitingChannel.username) {
			const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
			if (!isAvailable) throw new ConflictException('Username is already taken')
		}

		const channelType = dto.channelType ?? exitingChannel.channelType
		const username =
			channelType === ChannelType.PRIVATE ? null : (dto.username ?? exitingChannel.username)

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

		await this.chatsService.create(userId, ChatId(channelId))
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

		if (channel.ownerId === userId)
			throw new BadRequestException('Owner cannot unsubscribe. Delete it instead.')

		await this.prisma.$transaction(async (tx) => {
			await tx.channelSubscriber
				.delete({ where: { userId_channelId: { userId, channelId } } })
				.catch(() => {})

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
				.catch(() => {})

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
				},
				photos: {
					select: { fileId: true }
				}
			}
		})

		if (!channel) throw new NotFoundException('Channel not found')

		const isOwner = channel.ownerId == userId

		const response = plainToInstance(ChannelResponseDto, {
			...channel,
			isSubscribed: channel.subscribers.length > 0,
			isOwner,
			subscribers: channel._count.subscribers,
			removedUsers: channel._count.blockedUsers,
			avatars: channel.photos.map((p) => ({ fileId: p.fileId }))
		})
		return response
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
							{
								firstName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								lastName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								username: {
									contains: search,
									mode: 'insensitive'
								}
							}
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

	async delete(id: ChannelId): Promise<void> {
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
							{
								firstName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								lastName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								username: {
									contains: search,
									mode: 'insensitive'
								}
							}
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

		const deleted = await this.prisma.channelBlackList.delete({
			where: { userId_channelId: { userId: targetUserId, channelId: id } }
		})

		if (deleted != null) {
			throw new NotFoundException('User is not banned from this channel')
		}
	}

	async isBanned(channelId: ChannelId, userId: UserId): Promise<IsBannedDto> {
		const bannedUser = await this.prisma.channelBlackList.findFirst({
			where: { channelId, userId }
		})
		return plainToInstance(IsBannedDto, { isBanned: bannedUser != null })
	}

	async getJoinRequests(
		channelId: ChannelId,
		skip: number,
		take: number,
		search?: string
	): Promise<UserResponseDto[]> {
		const where: Prisma.ChannelJoinRequestWhereInput = {
			channelId,
			user: search
				? {
						OR: [
							{
								firstName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								lastName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								username: {
									contains: search,
									mode: 'insensitive'
								}
							}
						]
					}
				: undefined
		}

		const requests = await this.prisma.channelJoinRequest.findMany({
			where,
			skip,
			take,
			include: { user: true },
			orderBy: { createdAt: 'desc' }
		})

		return plainToInstance(
			UserResponseDto,
			requests.map((r) => r.user)
		)
	}

	async acceptJoinRequest(channelId: ChannelId, targetUserId: UserId): Promise<void> {
		const request = await this.prisma.channelJoinRequest.findUnique({
			where: { channelId_userId: { channelId, userId: targetUserId } }
		})

		if (!request) {
			throw new NotFoundException('Join request not found')
		}

		await this.prisma.$transaction(async (tx) => {
			await tx.channelJoinRequest.delete({
				where: { channelId_userId: { channelId, userId: targetUserId } }
			})

			const existingMember = await tx.channelSubscriber.findUnique({
				where: { userId_channelId: { channelId, userId: targetUserId } }
			})

			if (!existingMember) {
				await tx.channelSubscriber.create({
					data: { channelId, userId: targetUserId }
				})
			}
		})

		await this.chatsService.create(targetUserId, ChatId(channelId))

		const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
		if (channel) {
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

			this.realtimeGateway.sendToUser(targetUserId, SocketEvent.CHAT_NEW, chatPayload)
		}
	}

	async rejectJoinRequest(channelId: ChannelId, targetUserId: UserId): Promise<void> {
		await this.prisma.channelJoinRequest
			.delete({
				where: { channelId_userId: { channelId, userId: targetUserId } }
			})
			.catch(() => {})
	}

	async getChannelInviteLinks(channelId: ChannelId): Promise<InviteLinkResponseDto[]> {
		const links = await this.prisma.channelInviteLink.findMany({
			where: { channelId }
		})

		return plainToInstance(InviteLinkResponseDto, links)
	}

	async createChannelInviteLink(
		channelId: ChannelId,
		creatorId: UserId,
		dto: CreateInviteLinkDto
	): Promise<InviteLinkResponseDto> {
		const code = randomBytes(16).toString('hex')
		const inviteLink = await this.prisma.channelInviteLink.create({
			data: {
				code,
				channelId,
				creatorId,
				maxUses: dto.maxUses,
				expiresAt: dto.expiresAt ? BigInt(dto.expiresAt) : null,
				requireApproval: dto.requireApproval ?? false
			}
		})
		return plainToInstance(InviteLinkResponseDto, {
			...inviteLink,
			chatId: channelId
		})
	}

	async updateChannelInviteLink(
		channelId: ChannelId,
		linkId: number,
		dto: UpdateInviteLinkDto
	): Promise<InviteLinkResponseDto> {
		const existing = await this.prisma.channelInviteLink.findUnique({ where: { id: linkId } })
		if (!existing || existing.channelId !== channelId) {
			throw new NotFoundException('Invite link not found')
		}

		const inviteLink = await this.prisma.channelInviteLink.update({
			where: { id: linkId },
			data: {
				maxUses: dto.maxUses !== undefined ? dto.maxUses : existing.maxUses,
				expiresAt:
					dto.expiresAt !== undefined
						? dto.expiresAt
							? BigInt(dto.expiresAt)
							: null
						: existing.expiresAt
			}
		})
		return plainToInstance(InviteLinkResponseDto, {
			...inviteLink,
			chatId: channelId
		})
	}

	async deleteChannelInviteLink(channelId: ChannelId, linkId: number): Promise<void> {
		const existing = await this.prisma.channelInviteLink.findUnique({ where: { id: linkId } })
		if (!existing || existing.channelId !== channelId) {
			throw new NotFoundException('Invite link not found')
		}

		await this.prisma.channelInviteLink.delete({ where: { id: linkId } })
	}

	async confirmUploadAvatar(channelId: ChannelId, fileId: string): Promise<void> {
		const file = await this.prisma.file.findFirst({
			where: { id: fileId }
		})

		if (file == null) {
			throw new NotFoundException('File not found')
		}

		await this.storageService.confirmUpload(fileId)

		await this.prisma.channelPhoto.create({
			data: {
				channelId: channelId,
				fileId: file.id,
				isCurrent: true
			}
		})
	}

	async getAvatarDownloadUrl(fileId: string): Promise<FileDownloadDto> {
		const photo = await this.prisma.channelPhoto.findFirst({
			where: { fileId }
		})
		if (!photo) throw new NotFoundException('Avatar not found')
		return this.storageService.getDownloadUrl(fileId)
	}

	async deleteAvatar(channelId: ChannelId, fileId: string): Promise<void> {
		const photo = await this.prisma.channelPhoto.findFirst({
			where: { channelId, fileId }
		})
		if (!photo) throw new NotFoundException('Avatar not found')

		await this.prisma.channelPhoto.delete({
			where: { fileId }
		})
		await this.storageService.deleteFile(fileId)
	}
}

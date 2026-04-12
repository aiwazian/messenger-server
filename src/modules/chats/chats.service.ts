import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ChatResponseDto } from './dto/chat-response.dto'
import { plainToInstance } from 'class-transformer'
import { MessageResponseDto } from '../messages/dto/message-response.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { Prisma } from '../../../generated/prisma/client'
import { ChannelId } from '../../common/types/channel-id.type'
import { GroupId } from '../../common/types/group-id.type'

@Injectable()
export class ChatsService {
	constructor(private readonly prisma: PrismaService) { }

	async getAll(userId: UserId): Promise<ChatResponseDto[]> {
		const chats = await this.prisma.chat.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' }
		})

		if (chats.length === 0) {
			return []
		}

		const chatIds = chats.map((c) => c.chatId)
		const lastMessages = await this.prisma.message.findMany({
			where: { chatId: { in: chatIds } },
			orderBy: { sendTime: 'desc' },
			distinct: ['chatId'],
			select: {
				id: true,
				text: true,
				sendTime: true,
				senderId: true,
				chatId: true,
				files: true
			}
		})

		const lastMessagesMap = new Map(lastMessages.map((m) => [m.chatId, m]))

		const chatIdsByType = this.groupChatIdsByType(chats)

		const [groups, channels, users] = await Promise.all([
			chatIdsByType.group.length > 0
				? this.prisma.group.findMany({
					where: { id: { in: chatIdsByType.group } },
					select: { id: true, name: true }
				})
				: [],
			chatIdsByType.channel.length > 0
				? this.prisma.channel.findMany({
					where: { id: { in: chatIdsByType.channel } },
					select: { id: true, name: true }
				})
				: [],
			chatIdsByType.user.length > 0
				? this.prisma.user.findMany({
					where: { id: { in: chatIdsByType.user } },
					select: { id: true, firstName: true, lastName: true }
				})
				: []
		])

		const groupsMap = new Map<bigint, { id: bigint; name: string }>(
			groups.map((g) => [g.id, g] as [bigint, { id: bigint; name: string }])
		)
		const channelsMap = new Map<bigint, { id: bigint; name: string }>(
			channels.map((c) => [c.id, c] as [bigint, { id: bigint; name: string }])
		)
		const usersMap = new Map<bigint, { id: bigint; firstName: string | null; lastName: string | null }>(
			users.map((u) => [u.id, u] as [bigint, { id: bigint; firstName: string | null; lastName: string | null }])
		)

		const result = chats.map((chat) => {
			const chatType = detectChatType(ChatId(chat.chatId))
			let title = ''
			let resolvedChatId = chat.chatId

			if (chatType === ChatType.PRIVATE) {
				const otherUser = usersMap.get(chat.chatId)
				if (otherUser) {
					title = `${otherUser.firstName ?? ''} ${otherUser.lastName ?? ''}`.trim()
				} else if (chat.chatId === userId) {
					title = 'Saved messages'
				} else {
					title = 'Deleted User'
				}
			} else if (chatType === ChatType.GROUP) {
				const group = groupsMap.get(chat.chatId)
				title = group?.name ?? 'Deleted Group'
			} else if (chatType === ChatType.CHANNEL) {
				const channel = channelsMap.get(chat.chatId)
				title = channel?.name ?? 'Deleted Channel'
			}

			const lastMessage = lastMessagesMap.get(chat.chatId)
			return {
				id: resolvedChatId.toString(),
				name: title,
				isPinned: chat.isPinned,
				lastMessage: lastMessage
					? {
						...lastMessage,
						chatId: resolvedChatId.toString(),
						isRead: true,
						files: lastMessage.files?.map((f) => ({ ...f, size: f.size.toString() })) || []
					}
					: undefined
			}
		})

		return plainToInstance(ChatResponseDto, result)
	}

	private groupChatIdsByType(chats: { chatId: bigint }[]) {
		const group: bigint[] = []
		const channel: bigint[] = []
		const user: bigint[] = []

		for (const chat of chats) {
			const type = detectChatType(ChatId(chat.chatId))
			if (type === ChatType.GROUP) group.push(chat.chatId)
			else if (type === ChatType.CHANNEL) channel.push(chat.chatId)
			else user.push(chat.chatId)
		}

		return { group, channel, user }
	}

	async create(
		tx: Prisma.TransactionClient,
		userId: UserId,
		chatId: ChatId
	): Promise<void> {
		await tx.chat.upsert({
			where: {
				userId_chatId: { userId, chatId }
			},
			update: {},
			create: {
				userId,
				chatId,
				createdAt: Date.now()
			}
		})
	}

	async getById(userId: UserId, chatId: ChatId): Promise<ChatResponseDto> {
		const chat = await this.prisma.chat.findUnique({
			where: { userId_chatId: { userId, chatId } }
		})

		if (!chat) {
			throw new NotFoundException('Chat not found')
		}

		const type = detectChatType(chatId)
		let title = ''
		let resolvedChatId = chatId

		if (type === ChatType.PRIVATE) {
			const otherUser = await this.prisma.user.findUnique({
				where: { id: chatId },
				select: { id: true, firstName: true, lastName: true }
			})
			if (otherUser) {
				title = `${otherUser.firstName ?? ''} ${otherUser.lastName ?? ''}`.trim()
			} else if (chatId === ChatId(userId)) {
				title = 'Saved messages'
			} else {
				title = 'Deleted User'
			}
		} else if (type === ChatType.GROUP) {
			const group = await this.prisma.group.findUnique({ where: { id: chatId } })
			title = group?.name ?? 'Deleted Group'
		} else if (type === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({ where: { id: chatId } })
			title = channel?.name ?? 'Deleted Channel'
		}

		const lastMessage = await this.getLastMessage(chatId)

		return plainToInstance(ChatResponseDto, {
			id: resolvedChatId.toString(),
			name: title,
			isPinned: chat.isPinned,
			lastMessage
		})
	}

	async deleteChat(userId: UserId, chatId: ChatId): Promise<void> {
		await this.prisma.$transaction(async (tx) => {
			await tx.chat.deleteMany({
				where: { userId, chatId }
			})

			const membersCount = await tx.chat.count({
				where: { chatId }
			})

			if (membersCount === 0) {
				await tx.message.deleteMany({
					where: { chatId }
				})
			}
		})
	}

	async canReadChat(userId: UserId, chatId: ChatId): Promise<boolean> {
		const chatType = detectChatType(chatId)

		if (chatType === ChatType.PRIVATE) {
			const chat = await this.prisma.chat.findFirst({
				where: { userId, chatId }
			})

			if (!chat) {
				throw new ForbiddenException('User is not a chat participant')
			}

			return true
		}

		if (chatType === ChatType.GROUP) {
			const member = await this.prisma.groupMember.findFirst({
				where: { groupId: chatId, userId }
			})

			if (!member) {
				throw new ForbiddenException('User is not a group member')
			}

			return true
		}

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: chatId },
				select: { channelType: true, ownerId: true }
			})

			if (!channel) {
				throw new NotFoundException('Channel not found')
			}

			if (channel.channelType === 'PUBLIC') {
				return true
			}

			const subscriber = await this.prisma.channelSubscriber.findFirst({
				where: { channelId: chatId, userId }
			})

			if (subscriber) {
				return true
			}

			if (channel.ownerId !== userId) {
				throw new ForbiddenException('User is not a channel member')
			}

			return true
		}

		throw new ForbiddenException('Unsupported chat type')
	}

	async canReadMessage(userId: UserId, messageId: number, chatId?: ChatId): Promise<boolean> {
		if (!chatId) {
			throw new ForbiddenException('chatId is required')
		}

		const message = await this.prisma.message.findUnique({
			where: { id: messageId }
		})

		if (!message) {
			throw new NotFoundException('Message not found')
		}

		if (message.chatId !== chatId) {
			throw new ForbiddenException('Message does not belong to the specified chat')
		}

		await this.canReadChat(userId, chatId)
		return true
	}

	async exists(userId: UserId, chatId: ChatId): Promise<boolean> {
		const chat = await this.prisma.chat.findUnique({
			where: { userId_chatId: { userId, chatId } }
		})
		return !!chat
	}

	private async getLastMessage(chatId: bigint): Promise<MessageResponseDto | null> {
		const message = await this.prisma.message.findFirst({
			where: { chatId },
			orderBy: { sendTime: 'desc' },
			include: { files: true }
		})

		if (!message) return null

		return plainToInstance(MessageResponseDto, {
			...message,
			chatId: chatId.toString(),
			files: message.files.map((f) => ({ ...f, size: f.size.toString() }))
		})
	}
}

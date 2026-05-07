import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ChatResponseDto } from './dto/chat-response.dto'
import { plainToInstance } from 'class-transformer'
import { MessageAttachmentDto, MessageResponseDto } from '../messages/dto/message-response.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { EncryptionService } from '../encryption/encryption.service'

@Injectable()
export class ChatsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService
	) {}

	async getAll(userId: UserId): Promise<ChatResponseDto[]> {
		const chats = await this.prisma.chat.findMany({
			where: { userId }
		})

		if (chats.length === 0) {
			return []
		}

		const resChats = await Promise.all(
			chats.map(async (chat) => {
				switch (detectChatType(ChatId(chat.chatId))) {
					case ChatType.PRIVATE: {
						const user = await this.prisma.user.findUnique({ where: { id: chat.chatId } })
						if (user != null) {
							const lastMessage = await this.getLastMessage(userId, ChatId(chat.chatId))
							return plainToInstance(ChatResponseDto, {
								id: chat.chatId,
								name: user.firstName,
								isPinned: chat.isPinned,
								lastMessage: lastMessage
							})
						}
					}
					case ChatType.CHANNEL: {
						const channel = await this.prisma.channel.findUnique({ where: { id: chat.chatId } })
						if (channel != null) {
							const lastMessage = await this.getLastMessage(userId, ChatId(chat.chatId))
							return plainToInstance(ChatResponseDto, {
								id: chat.chatId,
								name: channel.name,
								isPinned: chat.isPinned,
								lastMessage: lastMessage
							})
						}
					}
					case ChatType.GROUP: {
						const group = await this.prisma.group.findUnique({ where: { id: chat.chatId } })
						if (group != null) {
							const lastMessage = await this.getLastMessage(userId, ChatId(chat.chatId))
							return plainToInstance(ChatResponseDto, {
								id: chat.chatId,
								name: group.name,
								isPinned: chat.isPinned,
								lastMessage: lastMessage
							})
						}
					}
					default:
						return null
				}
			})
		)

		return plainToInstance(
			ChatResponseDto,
			resChats.filter((chat) => chat != null)
		)
	}

	async create(userId: UserId, chatId: ChatId): Promise<void> {
		await this.prisma.chat.upsert({
			where: {
				chat_uniq_id: `${userId}${chatId}`
			},
			update: {},
			create: {
				chat_uniq_id: `${userId}${chatId}`,
				userId: userId,
				chatId: chatId
			}
		})
		if (detectChatType(chatId) == ChatType.PRIVATE) {
			await this.prisma.chat.upsert({
				where: {
					chat_uniq_id: `${chatId}${userId}`
				},
				update: {},
				create: {
					chat_uniq_id: `${chatId}${userId}`,
					userId: chatId,
					chatId: userId
				}
			})
		}
	}

	async getById(userId: UserId, chatId: ChatId): Promise<ChatResponseDto> {
		const chat = await this.prisma.chat.findUnique({
			where: {
				chat_uniq_id: `${userId}${chatId}`
			}
		})

		if (!chat) {
			throw new NotFoundException('Chat not found')
		}

		const type = detectChatType(chatId)
		let title = ''
		const resolvedChatId = chatId

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

		const lastMessage = await this.getLastMessage(userId, chatId)

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
			const group = await this.prisma.group.findUnique({
				where: { id: chatId },
				select: { groupType: true, ownerId: true }
			})

			if (!group) {
				throw new NotFoundException('Group not found')
			}

			if (group.groupType === 'PUBLIC') {
				return true
			}

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

	async canClearHistory(userId: UserId, chatId: ChatId): Promise<boolean> {
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
			const group = await this.prisma.group.findUnique({
				where: { id: chatId },
				select: { ownerId: true }
			})

			if (!group) {
				throw new NotFoundException('Group not found')
			}

			if (group.ownerId !== userId) {
				throw new ForbiddenException('Only owner can clear group history')
			}

			return true
		}

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: chatId },
				select: { ownerId: true }
			})

			if (!channel) {
				throw new NotFoundException('Channel not found')
			}

			if (channel.ownerId !== userId) {
				throw new ForbiddenException('Only owner can clear channel history')
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

		if (message.senderId !== userId && message.chatId !== chatId) {
			throw new ForbiddenException('Message does not belong to the specified chat')
		}

		await this.canReadChat(userId, chatId)
		return true
	}

	async exists(userId: UserId, chatId: ChatId): Promise<boolean> {
		const chat = await this.prisma.chat.findUnique({
			where: { chat_uniq_id: userId + '' + chatId }
		})
		return !!chat
	}

	private async getLastMessage(userId: UserId, chatId: ChatId): Promise<MessageResponseDto | null> {
		const message = await this.prisma.message.findFirst({
			where: {
				OR: [
					{ senderId: userId, chatId: chatId },
					{ senderId: chatId, chatId: userId }
				]
			},
			include: {
				attachments: {
					include: {
						file: true
					}
				},
				systemEvent: true
			},
			orderBy: {
				sendTime: 'desc'
			}
		})

		if (message == null) {
			return null
		}

		return plainToInstance(MessageResponseDto, {
			...message,
			text: message.text
				? this.encryption.decrypt(message.text, this.encryption.currentVersion)
				: null,
			isRead: true,
			systemEventType: message.systemEvent?.eventType,
			attachments: message.attachments.map((f) =>
				plainToInstance(MessageAttachmentDto, { ...f.file, type: f.type, fileId: f.fileId })
			),
			senderId:
				detectChatType(ChatId(message.chatId)) === ChatType.CHANNEL
					? message.chatId
					: message.senderId,
			messageType: message.messageType
		})
	}
}

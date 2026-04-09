import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { TextMessageDto } from './dto/text-message.dto'
import { MediaMessageDto } from './dto/media-message.dto'
import { plainToInstance } from 'class-transformer'
import { ChatsService } from '../chats/chats.service'
import { MessageResponseDto } from './dto/message-response.dto'
import { PushService } from '../push/push.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { StorageService } from '../storage/storage.service'
import { FileInitDto } from './dto/file-init.dto'
import { FileConfirmDto } from './dto/file-confirm.dto'
import { FileDownloadDto } from './dto/file-download.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ConversationType, FileStatus } from '../../../generated/prisma/enums'
import { ChatType } from '../../common/enums/chat-type.enum'
import { SocketEvent } from '../../common/socket/socket-events'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { Prisma } from '../../../generated/prisma/client'

@Injectable()
export class MessagesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService,
		private readonly pushService: PushService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly storageService: StorageService
	) { }

	async sendTextMessage(
		senderId: UserId,
		chatId: ChatId,
		dto: TextMessageDto
	): Promise<MessageResponseDto> {
		return this.withChat<MessageResponseDto>(senderId, chatId, async (tx, ctx) => {
			const sequenceId = await tx.message.count({ where: { conversationId: ctx.conversationId } })

			const actualSenderId =
				ctx.conversationType === ConversationType.CHANNEL ? ctx.ownerId : senderId
			const isSelfChat = ctx.chatType === ChatType.PRIVATE && senderId === (chatId as bigint)

			const message = await tx.message.create({
				data: {
					sequenceId: sequenceId + 1,
					conversationId: ctx.conversationId,
					text: dto.text,
					sendTime: Date.now(),
					senderId: actualSenderId,
					isRead: isSelfChat
				},
				include: { files: true }
			})

			const messageInstance = plainToInstance(MessageResponseDto, {
				...message,
				chatId: chatId.toString(),
				isRead: true,
				files: message.files.map((f: any) => ({ ...f, size: f.size.toString() }))
			})

			await this.notifyRecipients(senderId, chatId, ctx, messageInstance)

			return messageInstance
		})
	}

	async sendMediaMessage(
		senderId: UserId,
		chatId: ChatId,
		dto: MediaMessageDto
	): Promise<MessageResponseDto[]> {
		return this.withChat<MessageResponseDto[]>(senderId, chatId, async (tx, ctx) => {
			const files = await tx.file.findMany({
				where: { id: { in: dto.fileIds }, status: FileStatus.COMPLETED }
			})

			if (files.length !== dto.fileIds.length) {
				throw new NotFoundException('Some files were not found or not uploaded completely')
			}

			const actualSenderId =
				ctx.conversationType === ConversationType.CHANNEL ? ctx.ownerId : senderId
			const isSelfChat = ctx.chatType === ChatType.PRIVATE && senderId === (chatId as bigint)

			const results: MessageResponseDto[] = []

			const lastMessage = await tx.message.findFirst({
				where: { conversationId: ctx.conversationId },
				orderBy: { sequenceId: 'desc' },
				select: { sequenceId: true }
			})
			let nextSequenceId = (lastMessage?.sequenceId ?? 0n) + 1n

			for (const fileId of dto.fileIds) {
				const message = await tx.message.create({
					data: {
						sequenceId: nextSequenceId++,
						conversationId: ctx.conversationId,
						text: results.length === 0 ? dto.text : null,
						sendTime: Date.now(),
						senderId: actualSenderId,
						isRead: isSelfChat,
						files: {
							connect: { id: fileId }
						}
					},
					include: { files: true }
				})

				const messageInstance = plainToInstance(MessageResponseDto, {
					...message,
					chatId: chatId.toString(),
					isRead: true,
					files: message.files.map((f: any) => ({ ...f, size: f.size.toString() }))
				})

				await this.notifyRecipients(senderId, chatId, ctx, messageInstance)
				results.push(messageInstance)
			}

			return results
		})
	}

	async initFileUpload(userId: UserId, chatId: ChatId, dto: FileInitDto) {
		return this.withChat(userId, chatId, async (tx, ctx) => {
			return this.storageService.initUpload(dto.name, dto.size, dto.mimeType)
		})
	}

	async confirmFileUpload(
		userId: UserId,
		chatId: ChatId,
		dto: FileConfirmDto
	): Promise<MessageResponseDto> {
		return this.withChat<MessageResponseDto>(userId, chatId, async (tx, ctx) => {
			await this.storageService.confirmUpload(dto.fileId)

			const sequenceId = await tx.message.count({ where: { conversationId: ctx.conversationId } })

			const actualSenderId =
				ctx.conversationType === ConversationType.CHANNEL ? ctx.ownerId : userId
			const isSelfChat = ctx.chatType === ChatType.PRIVATE && userId === (chatId as bigint)

			const message = await tx.message.create({
				data: {
					sequenceId: sequenceId + 1,
					conversationId: ctx.conversationId,
					text: dto.text,
					sendTime: Date.now(),
					senderId: actualSenderId,
					isRead: isSelfChat,
					files: {
						connect: { id: dto.fileId }
					}
				},
				include: { files: true }
			})

			const messageInstance = plainToInstance(MessageResponseDto, {
				...message,
				chatId: chatId.toString(),
				isRead: true,
				files: message.files.map((f) => ({ ...f, size: f.size.toString() }))
			})

			await this.notifyRecipients(userId, chatId, ctx, messageInstance)

			return messageInstance
		})
	}

	async getFileDownloadUrl(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		fileId: string
	): Promise<FileDownloadDto> {
		return this.withChat(userId, chatId, async (tx, ctx) => {
			const message = await tx.message.findFirst({
				where: { id: messageId, conversationId: ctx.conversationId },
				include: { files: true }
			})

			if (!message) throw new NotFoundException('Message not found')

			const file = message.files.find((f) => f.id === fileId)
			if (!file) throw new NotFoundException('File not found in this message')

			return this.storageService.getDownloadUrl(fileId)
		})
	}

	async getAll(
		userId: UserId,
		chatId: ChatId,
		limit: number = 50,
		offset: number = 0
	): Promise<MessageResponseDto[]> {
		const conversation = await this.chatsService.findConversationByChatId(chatId, userId)

		const messages = await this.prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				AND: [
					{
						OR: [{ senderId: { not: userId } }, { deletedBySender: false }]
					},
					{
						OR: [{ senderId: userId }, { deletedByReceiver: false }]
					}
				]
			},
			include: {
				readReceipts: {
					where: { userId },
					select: { userId: true }
				},
				files: true
			},
			orderBy: { sendTime: 'desc' },
			take: limit,
			skip: offset
		})

		const messagesEntity = messages.map((message) => {
			const isRead = message.isRead || message.readReceipts.length > 0
			return plainToInstance(MessageResponseDto, {
				...message,
				chatId: chatId.toString(),
				isRead,
				files: message.files.map((f) => ({ ...f, size: f.size.toString() }))
			})
		})

		return messagesEntity.reverse()
	}

	async markRead(userId: UserId, messageId: number): Promise<void> {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			include: { conversation: true }
		})

		if (!message) {
			throw new NotFoundException('Message not found')
		}

		const existing = await this.prisma.messageRead.findFirst({
			where: { messageId, userId }
		})

		if (!existing) {
			await this.prisma.messageRead.create({
				data: {
					messageId,
					userId,
					readAt: Date.now()
				}
			})
		}

		if (message.conversation.type === ConversationType.DIRECT) {
			await this.prisma.message.update({
				where: { id: messageId },
				data: { isRead: true }
			})
		}
	}

	async markAllRead(userId: UserId, chatId: ChatId): Promise<void> {
		const conversation = await this.chatsService.findConversationByChatId(chatId, userId)

		const unread = await this.prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				readReceipts: { none: { userId } }
			},
			select: { id: true }
		})

		if (unread.length === 0) return

		const now = Date.now()

		await this.prisma.messageRead.createMany({
			data: unread.map((m) => ({
				messageId: m.id,
				userId,
				readAt: now
			}))
		})

		if (conversation.type === ConversationType.DIRECT) {
			await this.prisma.message.updateMany({
				where: { id: { in: unread.map((m) => m.id) } },
				data: { isRead: true }
			})
		}
	}

	async deleteMessage(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		forEveryone: boolean = false
	): Promise<void> {
		const conversation = await this.chatsService.findConversationByChatId(chatId, userId)

		const message = await this.prisma.message.findFirst({
			where: { id: messageId, conversationId: conversation.id }
		})

		if (!message) {
			throw new NotFoundException('Message not found')
		}

		const isDirect = conversation.type === ConversationType.DIRECT

		if (!isDirect || forEveryone) {
			const files = await this.prisma.file.findMany({
				where: { messageId: messageId }
			})

			for (const file of files) {
				await this.storageService.deleteFile(file.id)
			}

			await this.prisma.message.delete({
				where: { id: messageId }
			})
		} else {
			const isSender = message.senderId === userId
			const updateData = isSender ? { deletedBySender: true } : { deletedByReceiver: true }

			const updated = await this.prisma.message.update({
				where: { id: messageId },
				data: updateData
			})

			if (updated.deletedBySender && updated.deletedByReceiver) {
				const files = await this.prisma.file.findMany({
					where: { messageId: messageId }
				})

				for (const file of files) {
					await this.storageService.deleteFile(file.id)
				}

				await this.prisma.message.delete({
					where: { id: messageId }
				})
			}
		}

		const ctx = await this.chatsService.resolveConversation(this.prisma, userId, chatId)
		const recipients = await this.getRecipients(userId, chatId, ctx.chatType)

		const senderPayload = { chatId: chatId.toString(), messageId }
		this.realtimeGateway.sendToUser(userId, SocketEvent.MESSAGE_DELETE, senderPayload)

		if (!isDirect || forEveryone) {
			const recipientPayload = { chatId: userId.toString(), messageId }
			for (const recipientId of recipients) {
				this.realtimeGateway.sendToUser(recipientId, SocketEvent.MESSAGE_DELETE, recipientPayload)
			}
		}
	}

	async clearHistory(userId: UserId, chatId: ChatId): Promise<void> {
		const conversation = await this.chatsService.findConversationByChatId(chatId, userId)
		const chatType = detectChatType(chatId)

		const messages = await this.prisma.message.findMany({
			where: { conversationId: conversation.id },
			include: { files: true }
		})

		for (const message of messages) {
			for (const file of message.files) {
				await this.storageService.deleteFile(file.id)
			}
		}

		await this.prisma.message.deleteMany({
			where: { conversationId: conversation.id }
		})

		const ctx = await this.chatsService.resolveConversation(this.prisma, userId, chatId)
		const recipients = await this.getRecipients(userId, chatId, ctx.chatType)
		const targets = Array.from(new Set([...recipients, userId]))

		const payload = { chatId: chatId.toString() }

		this.realtimeGateway.sendToChat(chatId, SocketEvent.HISTORY_CLEAR, payload)
		this.realtimeGateway.sendToUsersExceptChat(targets, chatId, SocketEvent.HISTORY_CLEAR, payload)
	}

	private async withChat<T>(
		userId: UserId,
		chatId: ChatId,
		fn: (
			tx: Prisma.TransactionClient,
			ctx: {
				conversationId: number
				conversationType: ConversationType
				ownerId: bigint
				chatType: ChatType
			}
		) => Promise<T>
	): Promise<T> {
		return await this.prisma.$transaction(async (tx) => {
			const ctx = await this.chatsService.resolveConversation(tx, userId, chatId)

			await this.chatsService.create(
				tx,
				userId,
				ctx.conversationId,
				ctx.chatType === ChatType.PRIVATE ? (chatId as bigint) : undefined
			)

			if (ctx.chatType === ChatType.PRIVATE) {
				await this.chatsService.create(tx, UserId(chatId), ctx.conversationId, userId)
			}

			return fn(tx, ctx)
		})
	}

	private async notifyRecipients(
		senderUserId: UserId,
		chatId: ChatId,
		ctx: {
			conversationId: number
			conversationType: ConversationType
			ownerId: bigint
			chatType: ChatType
		},
		message: MessageResponseDto
	): Promise<void> {
		const recipients = await this.getRecipients(senderUserId, chatId, ctx.chatType)
		const wsTargets = Array.from(new Set([...recipients, senderUserId]))

		const online: UserId[] = []
		const offline: UserId[] = []

		for (const userId of wsTargets) {
			if (this.realtimeGateway.isUserOnline(userId)) {
				online.push(userId)
			} else if (userId !== senderUserId) {
				offline.push(userId)
			}
		}

		if (ChatId(senderUserId) == chatId) {
			this.realtimeGateway.sendToUser(senderUserId, SocketEvent.MESSAGE_NEW, message)
		} else {
			this.realtimeGateway.sendToChat(chatId, SocketEvent.MESSAGE_NEW, message)
		}

		if (online.length > 0) {
			this.realtimeGateway.sendToUsersExceptChat(online, chatId, SocketEvent.MESSAGE_NEW, message)
		}

		if (offline.length > 0) {
			await this.pushService.sendToUsers(offline, {
				title: 'Новое сообщение',
				body: message.text || 'Вложение',
				data: {
					type: 'message',
					chatId: message.chatId,
					messageId: message.id.toString()
				}
			})
		}
	}

	private async getRecipients(
		senderUserId: UserId,
		chatId: ChatId,
		chatType: ChatType
	): Promise<UserId[]> {
		if (chatType === ChatType.PRIVATE) {
			const recipient = UserId(chatId)
			return recipient === senderUserId ? [] : [recipient]
		}

		if (chatType === ChatType.GROUP) {
			const members = await this.prisma.groupMember.findMany({
				where: { groupId: chatId },
				select: { userId: true }
			})
			return members.map((m) => UserId(m.userId)).filter((id) => id !== senderUserId)
		}

		if (chatType === ChatType.CHANNEL) {
			const subs = await this.prisma.channelSubscriber.findMany({
				where: { channelId: chatId },
				select: { userId: true }
			})
			return subs.map((s) => UserId(s.userId)).filter((id) => id !== senderUserId)
		}

		return []
	}
}

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
import { PrismaService, SYSTEM_USER_ID } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { FileStatus } from '../../../generated/prisma/enums'
import { ChatType } from '../../common/enums/chat-type.enum'
import { SocketEvent } from '../../common/socket/socket-events'
import { Prisma } from '../../../generated/prisma/client'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { ChannelsService } from '../channels/channels.service'
import { ChannelId } from '../../common/types/channel-id.type'

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
		return this.withChat<MessageResponseDto>(senderId, chatId, async (tx) => {
			const sequenceId = await tx.message.count({ where: { chatId } })
			const chatType = detectChatType(chatId)

			const message = await tx.message.create({
				data: {
					sequenceId: sequenceId + 1,
					chatId,
					text: dto.text,
					sendTime: Date.now(),
					senderId
				},
				include: { files: true }
			})

			const messageInstance = plainToInstance(MessageResponseDto, {
				...message,
				isRead: true,
				senderId: chatType === ChatType.CHANNEL ? message.chatId : message.senderId,
				files: message.files.map((f: any) => ({ ...f, size: f.size.toString() }))
			})

			await this.notifyRecipients(senderId, chatId, messageInstance)

			return messageInstance
		})
	}

	async sendMediaMessage(
		senderId: UserId,
		chatId: ChatId,
		dto: MediaMessageDto
	): Promise<MessageResponseDto[]> {
		return this.withChat<MessageResponseDto[]>(senderId, chatId, async (tx) => {
			const files = await tx.file.findMany({
				where: { id: { in: dto.fileIds }, status: FileStatus.COMPLETED }
			})

			if (files.length !== dto.fileIds.length) {
				throw new NotFoundException('Some files were not found or not uploaded completely')
			}

			const results: MessageResponseDto[] = []

			const lastMessage = await tx.message.findFirst({
				where: { chatId },
				orderBy: { sequenceId: 'desc' },
				select: { sequenceId: true }
			})
			let nextSequenceId = (lastMessage?.sequenceId ?? 0n) + 1n

			for (const fileId of dto.fileIds) {
				const message = await tx.message.create({
					data: {
						sequenceId: nextSequenceId++,
						chatId,
						text: results.length === 0 ? dto.text : null,
						sendTime: Date.now(),
						senderId,
						files: { connect: { id: fileId } }
					},
					include: { files: true }
				})

				const messageInstance = plainToInstance(MessageResponseDto, {
					...message,
					chatId: chatId.toString(),
					isRead: true,
					files: message.files.map((f: any) => ({ ...f, size: f.size.toString() }))
				})

				await this.notifyRecipients(senderId, chatId, messageInstance)
				results.push(messageInstance)
			}

			return results
		})
	}

	async initFileUpload(userId: UserId, chatId: ChatId, dto: FileInitDto) {
		return this.withChat(userId, chatId, async () => {
			return this.storageService.initUpload(dto.name, dto.size, dto.mimeType)
		})
	}

	async confirmFileUpload(
		userId: UserId,
		chatId: ChatId,
		dto: FileConfirmDto
	): Promise<MessageResponseDto> {
		return this.withChat<MessageResponseDto>(userId, chatId, async (tx) => {
			await this.storageService.confirmUpload(dto.fileId)

			const sequenceId = await tx.message.count({ where: { chatId } })

			const message = await tx.message.create({
				data: {
					sequenceId: sequenceId + 1,
					chatId,
					text: dto.text,
					sendTime: Date.now(),
					senderId: userId,
					files: { connect: { id: dto.fileId } }
				},
				include: { files: true }
			})

			const messageInstance = plainToInstance(MessageResponseDto, {
				...message,
				chatId: chatId.toString(),
				isRead: true,
				files: message.files.map((f) => ({ ...f, size: f.size.toString() }))
			})

			await this.notifyRecipients(userId, chatId, messageInstance)

			return messageInstance
		})
	}

	async getFileDownloadUrl(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		fileId: string
	): Promise<FileDownloadDto> {
		return this.withChat(userId, chatId, async () => {
			const message = await this.prisma.message.findFirst({
				where: { id: messageId, chatId },
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
		await this.chatsService.canReadChat(userId, chatId)

		const chatType = detectChatType(chatId)

		let messageWhere: Prisma.MessageWhereInput

		if (chatType === ChatType.PRIVATE) {
			messageWhere = {
				OR: [
					{ senderId: userId, chatId: chatId },
					{ senderId: chatId, chatId: userId }
				]
			}
		} else {
			messageWhere = {
				chatId: chatId
			}
		}

		const messages = await this.prisma.message.findMany({
			where: messageWhere,
			include: {
				readReceipts: { where: { userId }, select: { userId: true } },
				files: true
			},
			orderBy: { sendTime: 'desc' },
			take: limit,
			skip: offset
		})

		return messages.reverse().map((message) => {
			const isRead = true // TODO
			return plainToInstance(MessageResponseDto, {
				...message,
				isRead,
				files: message.files.map((f) => ({ ...f, size: f.size.toString() })),
				senderId: message.senderId === SYSTEM_USER_ID ? SYSTEM_USER_ID : chatType === ChatType.CHANNEL ? message.chatId : message.senderId
			})
		})
	}

	async markRead(userId: UserId, messageId: number): Promise<void> {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId }
		})

		if (!message) throw new NotFoundException('Message not found')

		const existing = await this.prisma.messageRead.findFirst({
			where: { messageId, userId }
		})

		if (!existing) {
			await this.prisma.messageRead.create({
				data: { messageId, userId, readAt: Date.now() }
			})
		}

		const chatType = detectChatType(ChatId(message.chatId))
		if (chatType === ChatType.PRIVATE) {
			// await this.prisma.message.update({
			// 	where: { id: messageId }
			// }) TODO
		}
	}

	async markAllRead(userId: UserId, chatId: ChatId): Promise<void> {
		await this.chatsService.canReadChat(userId, chatId)

		const unread = await this.prisma.message.findMany({
			where: {
				chatId,
				readReceipts: { none: { userId } }
			},
			select: { id: true }
		})

		if (unread.length === 0) return

		const now = Date.now()
		await this.prisma.messageRead.createMany({
			data: unread.map((m) => ({ messageId: m.id, userId, readAt: now }))
		})

		const chatType = detectChatType(chatId)
		if (chatType === ChatType.PRIVATE) {
			// await this.prisma.message.updateMany({
			// 	where: { id: { in: unread.map((m) => m.id) } },
			// 	data: { isRead: true }
			// }) TODO
		}
	}

	async deleteMessage(
		userId: UserId,
		chatId: ChatId,
		messageId: number
	): Promise<void> {
		const message = await this.prisma.message.findFirst({
			where: { id: messageId, chatId: chatId }
		})

		if (!message) throw new NotFoundException('Message not found')

		const chatType = detectChatType(chatId)
		const isDirect = chatType === ChatType.PRIVATE

		const files = await this.prisma.file.findMany({ where: { messageId } })
		for (const file of files) {
			await this.storageService.deleteFile(file.id)
		}
		await this.prisma.message.delete({ where: { id: messageId } })

		const recipients = await this.getRecipients(userId, chatId, detectChatType(chatId))

		const senderPayload = { chatId: chatId.toString(), messageId }
		this.realtimeGateway.sendToUser(userId, SocketEvent.MESSAGE_DELETE, senderPayload)

		if (!isDirect) {
			const recipientPayload = { chatId: userId.toString(), messageId }
			for (const recipientId of recipients) {
				this.realtimeGateway.sendToUser(recipientId, SocketEvent.MESSAGE_DELETE, recipientPayload)
			}
		}
	}

	async clearHistory(userId: UserId, chatId: ChatId): Promise<void> {
		const chatType = detectChatType(chatId)

		let messageWhere: Prisma.MessageWhereInput
		if (chatType === ChatType.PRIVATE) {
			messageWhere = {
				OR: [
					{ senderId: userId, chatId: chatId },
					{ senderId: chatId, chatId: userId }
				]
			}
		} else {
			messageWhere = { chatId: chatId, senderId: { not: SYSTEM_USER_ID } }
		}

		const messages = await this.prisma.message.findMany({
			where: messageWhere,
			include: { files: true }
		})

		for (const message of messages) {
			for (const file of message.files) {
				await this.storageService.deleteFile(file.id)
			}
		}

		await this.prisma.message.deleteMany({ where: messageWhere })

		const recipients = await this.getRecipients(userId, chatId, chatType)
		const targets = Array.from(new Set([...recipients, userId]))

		if (chatType === ChatType.PRIVATE) {
			const otherUserId = recipients[0]
			const payloadForMe = { chatId: chatId.toString() }
			this.realtimeGateway.sendToUser(userId, SocketEvent.HISTORY_CLEAR, payloadForMe)

			if (otherUserId) {
				const payloadForOther = { chatId: userId.toString() }
				this.realtimeGateway.sendToUser(otherUserId, SocketEvent.HISTORY_CLEAR, payloadForOther)
			}
		} else {
			const payload = { chatId: chatId.toString() }
			this.realtimeGateway.sendToChat(chatId, SocketEvent.HISTORY_CLEAR, payload)
			this.realtimeGateway.sendToUsersExceptChat(targets, chatId, SocketEvent.HISTORY_CLEAR, payload)
		}
	}

	private async withChat<T>(
		userId: UserId,
		chatId: ChatId,
		fn: (tx: Prisma.TransactionClient) => Promise<T>
	): Promise<T> {
		return await this.prisma.$transaction(async (tx) => {
			await this.chatsService.create(tx, userId, chatId)

			if (detectChatType(chatId) === ChatType.PRIVATE) {
				await this.chatsService.create(tx, UserId(BigInt(chatId)), ChatId(userId))
			}

			return fn(tx)
		})
	}

	private async notifyRecipients(
		senderUserId: UserId,
		chatId: ChatId,
		message: MessageResponseDto
	): Promise<void> {
		const chatType = detectChatType(chatId)
		const recipients = await this.getRecipients(senderUserId, chatId, chatType)
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

		if (BigInt(chatId) === BigInt(senderUserId)) {
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

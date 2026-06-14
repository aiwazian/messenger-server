import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { TextMessageDto } from './dto/text-message.dto'
import { plainToInstance } from 'class-transformer'
import { ChatsService } from '../chats/chats.service'
import {
	MessageAttachmentDto,
	MessageReadInfoDto,
	MessageResponseDto
} from './dto/message-response.dto'
import { PushService } from '../push/push.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { StorageService } from '../storage/storage.service'
import { FileType } from '../../common/enums/file-type.enum'
import { FileInitDto } from './dto/file-init.dto'
import { FileConfirmDto } from './dto/file-confirm.dto'
import { FileDownloadDto } from './dto/file-download.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { AttachmentType, MessageType, SystemEventType } from '../../../generated/prisma/enums'
import { ChatType } from '../../common/enums/chat-type.enum'
import { SocketEvent } from '../../common/socket/socket-events'
import { Prisma } from '../../../generated/prisma/client'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { EncryptionService } from '../encryption/encryption.service'
import { DeleteMessageDto } from './dto/delete-message.dto'

@Injectable()
export class MessagesService {
	private lastCleanupTime = 0
	private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000

	constructor(
		private readonly prisma: PrismaService,
		@Inject(forwardRef(() => ChatsService))
		private readonly chatsService: ChatsService,
		private readonly pushService: PushService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly storageService: StorageService,
		private readonly encryption: EncryptionService
	) {}

	async initFileUpload(userId: UserId, chatId: ChatId, dto: FileInitDto) {
		await this.chatsService.create(userId, chatId)
		return this.storageService.initUpload(dto.name, dto.size, FileType.CHAT_ATTACHMENT)
	}

	async confirmFileUpload(
		userId: UserId,
		chatId: ChatId,
		dto: FileConfirmDto,
		excludeSocketId: string
	): Promise<MessageResponseDto> {
		await this.chatsService.create(userId, chatId)

		const attachmentsToCreate = []

		for (let i = 0; i < dto.attachments.length; i++) {
			const att = dto.attachments[i]
			await this.storageService.confirmUpload(att.fileId)

			const file = await this.prisma.file.findUnique({ where: { id: att.fileId } })
			if (!file) throw new NotFoundException(`File ${att.fileId} not found`)

			let attachmentType = att.type || AttachmentType.FILE

			if (attachmentType === AttachmentType.IMAGE && !file.mimeType.startsWith('image/')) {
				attachmentType = AttachmentType.FILE
			} else if (attachmentType === AttachmentType.VIDEO && !file.mimeType.startsWith('video/')) {
				attachmentType = AttachmentType.FILE
			}

			attachmentsToCreate.push({
				fileId: att.fileId,
				type: attachmentType,
				sortOrder: i
			})
		}

		const sequenceId = await this.prisma.message.count({
			where: {
				OR: [
					{ chatId: chatId, senderId: userId },
					{ chatId: userId, senderId: chatId }
				]
			}
		})

		const message = await this.prisma.message.create({
			data: {
				sequenceId: sequenceId + 1,
				chatId,
				text: dto.text,
				sendTime: Date.now(),
				senderId: userId,
				messageType: MessageType.TEXT,
				encryptionKeyVersion: this.encryption.currentVersion,
				attachments: {
					createMany: {
						data: attachmentsToCreate
					}
				}
			},
			include: { attachments: { include: { file: true } } }
		})

		const messageInstance = plainToInstance(MessageResponseDto, {
			...message,
			attachments: message.attachments.map((f) =>
				plainToInstance(MessageAttachmentDto, { ...f.file, fileId: f.fileId, type: f.type })
			),
			messageType: MessageType.TEXT
		})

		this.notifyRecipients(userId, chatId, messageInstance, excludeSocketId)

		return messageInstance
	}

	async getFileDownloadUrl(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		fileId: string
	): Promise<FileDownloadDto> {
		await this.chatsService.create(userId, chatId)

		const message = await this.prisma.message.findFirst({
			where: { id: messageId, chatId },
			include: { attachments: true }
		})

		if (!message) throw new NotFoundException('Message not found')

		const file = message.attachments.find((f) => f.fileId === fileId)
		if (!file) throw new NotFoundException('File not found in this message')

		return this.storageService.getDownloadUrl(fileId)
	}

	async getAll(
		userId: UserId,
		chatId: ChatId,
		limit: number = 50,
		offset: number = 0
	): Promise<MessageResponseDto[]> {
		this.cleanupOldReadReceipts()

		const chatType = detectChatType(chatId)

		let messageWhere: Prisma.MessageWhereInput

		if (chatType === ChatType.PRIVATE) {
			messageWhere = {
				OR: [
					{ senderId: userId, chatId: chatId },
					{ senderId: chatId, chatId: userId }
				],
				deletedFor: {
					none: {
						userId: userId
					}
				}
			}
		} else {
			messageWhere = {
				chatId: chatId,
				deletedFor: {
					none: {
						userId: userId
					}
				}
			}
		}

		const messages = await this.prisma.message.findMany({
			where: messageWhere,
			include: {
				readReceipts: {
					select: {
						userId: true,
						readAt: true,
						user: { select: { firstName: true, lastName: true } }
					}
				},
				attachments: { include: { file: true } },
				systemEvent: { select: { eventType: true } }
			},
			orderBy: { sendTime: 'desc' },
			take: limit,
			skip: offset
		})

		return messages.reverse().map((message) => {
			let isRead: boolean | undefined
			let readInfo: MessageReadInfoDto[] | undefined

			if (chatType === ChatType.CHANNEL) {
				isRead = undefined
				readInfo = undefined
			} else if (chatType === ChatType.PRIVATE) {
				const myReceipt = message.readReceipts.find((r) => r.userId === userId)
				const otherReceipt = message.readReceipts.find((r) => r.userId !== userId)

				if (message.senderId === userId) {
					isRead = !!otherReceipt
				} else {
					isRead = !!myReceipt
				}
				readInfo = undefined
			} else if (chatType === ChatType.GROUP) {
				const otherReceipts = message.readReceipts.filter((r) => r.userId !== message.senderId)
				isRead = otherReceipts.length > 0
				if (message.senderId === userId) {
					readInfo = otherReceipts.map((r) =>
						plainToInstance(MessageReadInfoDto, {
							userId: r.userId,
							firstName: r.user.firstName,
							lastName: r.user.lastName,
							readAt: r.readAt
						})
					)
				} else {
					readInfo = undefined
				}
			}

			return plainToInstance(MessageResponseDto, {
				...message,
				text: message.text
					? this.encryption.decrypt(message.text, this.encryption.currentVersion)
					: null,
				isRead,
				readInfo,
				systemEventType: message.systemEvent?.eventType,
				attachments: message.attachments.map((f) =>
					plainToInstance(MessageAttachmentDto, { ...f.file, fileId: f.fileId, type: f.type })
				),
				senderId: chatType === ChatType.CHANNEL ? message.chatId : message.senderId,
				messageType: message.messageType
			})
		})
	}

	async markRead(userId: UserId, messageId: number): Promise<void> {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId }
		})

		if (!message) throw new NotFoundException('Message not found')

		const chatType = detectChatType(ChatId(message.chatId))
		if (chatType === ChatType.CHANNEL) return

		const now = Date.now()

		const earlierMessages = await this.prisma.message.findMany({
			where: {
				chatId: message.chatId,
				senderId: message.senderId,
				sendTime: { lte: message.sendTime }
			},
			select: { id: true }
		})

		const existingReads = await this.prisma.messageRead.findMany({
			where: {
				userId,
				messageId: { in: earlierMessages.map((m) => m.id) }
			},
			select: { messageId: true }
		})

		const existingSet = new Set(existingReads.map((r) => r.messageId))
		const newReads = earlierMessages
			.filter((m) => !existingSet.has(m.id))
			.map((m) => ({ messageId: m.id, userId, readAt: now }))

		if (newReads.length > 0) {
			for (const read of newReads) {
				try {
					await this.prisma.messageRead.upsert({
						where: {
							messageId_userId: { messageId: read.messageId, userId: read.userId }
						},
						update: {},
						create: read
					})
				} catch {
					// ignore race condition duplicates
				}
			}
		}

		if (chatType === ChatType.PRIVATE) {
			const senderId = UserId(message.senderId)
			if (senderId !== userId) {
				this.realtimeGateway.sendToUser(senderId, SocketEvent.CHAT_READ, {
					chatId: message.chatId.toString(),
					messageId: messageId.toString(),
					userId: userId.toString(),
					time: now.toString(),
					senderId: message.senderId.toString(),
					sendTime: message.sendTime.toString()
				})
			}
		} else if (chatType === ChatType.GROUP) {
			const members = await this.prisma.groupMember.findMany({
				where: { groupId: message.chatId },
				select: { userId: true }
			})
			const recipientIds = members.map((m) => UserId(m.userId)).filter((id) => id !== userId)
			for (const recipientId of recipientIds) {
				this.realtimeGateway.sendToUser(recipientId, SocketEvent.CHAT_READ, {
					chatId: message.chatId.toString(),
					messageId: messageId.toString(),
					userId: userId.toString(),
					time: now.toString(),
					senderId: message.senderId.toString(),
					sendTime: message.sendTime.toString()
				})
			}
		}
	}

	async markAllRead(userId: UserId, chatId: ChatId): Promise<void> {
		const chatType = detectChatType(chatId)
		if (chatType === ChatType.CHANNEL) return

		let messageWhere: any
		if (chatType === ChatType.PRIVATE) {
			messageWhere = {
				OR: [
					{ senderId: userId, chatId: chatId },
					{ senderId: chatId, chatId: userId }
				]
			}
		} else {
			messageWhere = { chatId }
		}

		const unread = await this.prisma.message.findMany({
			where: {
				...messageWhere,
				readReceipts: { none: { userId } }
			},
			select: { id: true, senderId: true, sendTime: true }
		})

		if (unread.length === 0) return

		const now = Date.now()
		for (const m of unread) {
			try {
				await this.prisma.messageRead.upsert({
					where: {
						messageId_userId: { messageId: m.id, userId }
					},
					update: {},
					create: { messageId: m.id, userId, readAt: now }
				})
			} catch {
				// ignore race condition duplicates
			}
		}

		if (chatType === ChatType.PRIVATE) {
			const lastUnread = unread.reduce((latest, m) => (m.sendTime > latest.sendTime ? m : latest))

			this.realtimeGateway.sendToUser(UserId(chatId), SocketEvent.CHAT_READ, {
				chatId: chatId.toString(),
				messageId: lastUnread.id.toString(),
				userId: userId.toString(),
				time: now.toString(),
				senderId: lastUnread.senderId.toString(),
				sendTime: lastUnread.sendTime.toString()
			})
		} else if (chatType === ChatType.GROUP) {
			const members = await this.prisma.groupMember.findMany({
				where: { groupId: chatId },
				select: { userId: true }
			})
			const recipientIds = members.map((m) => UserId(m.userId)).filter((id) => id !== userId)
			const lastUnread = unread.reduce((latest, m) => (m.sendTime > latest.sendTime ? m : latest))

			for (const recipientId of recipientIds) {
				this.realtimeGateway.sendToUser(recipientId, SocketEvent.CHAT_READ, {
					chatId: chatId.toString(),
					messageId: lastUnread.id.toString(),
					userId: userId.toString(),
					time: now.toString(),
					senderId: lastUnread.senderId.toString(),
					sendTime: lastUnread.sendTime.toString()
				})
			}
		}
	}

	async deleteMessage(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		dto: DeleteMessageDto
	): Promise<void> {
		const chatType = detectChatType(chatId)
		const isPrivateChat = chatType === ChatType.PRIVATE

		if (isPrivateChat && !dto.deleteForRecipient) {
			const existingDelete = await this.prisma.deletedMessage.findFirst({
				where: { messageId, userId: chatId }
			})

			if (existingDelete) {
				const attachments = await this.prisma.messageAttachment.findMany({
					where: { messageId: messageId }
				})
				for (const attachment of attachments) {
					await this.storageService.deleteFile(attachment.fileId)
				}
				await this.prisma.message.delete({ where: { id: messageId } })
			} else {
				await this.prisma.deletedMessage.create({
					data: {
						messageId,
						userId,
						deletedAt: Date.now()
					}
				})
			}
		} else {
			const attachments = await this.prisma.messageAttachment.findMany({
				where: { messageId: messageId }
			})
			for (const attachment of attachments) {
				await this.storageService.deleteFile(attachment.fileId)
			}
			await this.prisma.message.delete({ where: { id: messageId } })
		}

		if (dto.deleteForRecipient) {
			const senderPayload = { chatId: chatId, messageId }
			this.realtimeGateway.sendToUser(UserId(chatId), SocketEvent.MESSAGE_DELETE, senderPayload)
		}

		if (!isPrivateChat) {
			const recipients = await this.getRecipients(userId, chatId, chatType)
			const recipientPayload = { chatId: userId, messageId }
			for (const recipientId of recipients) {
				this.realtimeGateway.sendToUser(recipientId, SocketEvent.MESSAGE_DELETE, recipientPayload)
			}
		}
	}

	async clearHistory(
		userId: UserId,
		chatId: ChatId,
		clearForRecipient: boolean = false
	): Promise<void> {
		const chatType = detectChatType(chatId)

		const isPrivateChat = chatType === ChatType.PRIVATE

		let messageWhere: Prisma.MessageWhereInput
		if (isPrivateChat) {
			messageWhere = {
				OR: [
					{ senderId: userId, chatId: chatId },
					{ senderId: chatId, chatId: userId }
				]
			}
		} else {
			messageWhere = {
				chatId: chatId,
				OR: [
					{ systemEvent: null },
					{
						systemEvent: {
							eventType: { notIn: [SystemEventType.CHANNEL_CREATED, SystemEventType.GROUP_CREATED] }
						}
					}
				]
			}
		}

		if (isPrivateChat && !clearForRecipient) {
			const messagesToHide = await this.prisma.message.findMany({
				where: {
					...messageWhere,
					deletedFor: {
						none: { userId }
					}
				},
				select: { id: true }
			})

			if (messagesToHide.length > 0) {
				const now = Date.now()
				await this.prisma.deletedMessage.createMany({
					data: messagesToHide.map((m) => ({
						messageId: m.id,
						userId: userId,
						deletedAt: now
					}))
				})
			}
		} else {
			const messages = await this.prisma.message.findMany({
				where: messageWhere,
				select: { attachments: { select: { fileId: true } } }
			})

			for (const message of messages) {
				for (const file of message.attachments) {
					await this.storageService.deleteFile(file.fileId)
				}
			}

			await this.prisma.message.deleteMany({ where: messageWhere })
		}

		const recipients = await this.getRecipients(userId, chatId, chatType)
		const targets = Array.from(new Set([...recipients, userId]))

		if (isPrivateChat) {
			const otherUserId = recipients[0]
			const payloadForMe = { chatId: chatId }
			this.realtimeGateway.sendToUser(userId, SocketEvent.HISTORY_CLEAR, payloadForMe)

			if (otherUserId && clearForRecipient) {
				const payloadForOther = { chatId: userId }
				this.realtimeGateway.sendToUser(otherUserId, SocketEvent.HISTORY_CLEAR, payloadForOther)
			}
		} else {
			const payload = { chatId: chatId }
			this.realtimeGateway.sendToChat(chatId, SocketEvent.HISTORY_CLEAR, payload)
			this.realtimeGateway.sendToUsersExceptChat(
				targets,
				chatId,
				SocketEvent.HISTORY_CLEAR,
				payload,
				undefined
			)
		}

		if (!isPrivateChat || clearForRecipient) {
			await this.prisma.message.create({
				data: {
					sequenceId: 0,
					chatId: chatId,
					senderId: userId,
					text: null,
					sendTime: Date.now(),
					messageType: MessageType.SYSTEM,
					systemEvent: { create: { eventType: SystemEventType.HISTORY_CLEARED } },
					encryptionKeyVersion: this.encryption.currentVersion
				}
			})
		}
	}

	async notifyRecipients(
		senderUserId: UserId,
		chatId: ChatId,
		message: MessageResponseDto,
		excludeSocketId?: string
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
			this.realtimeGateway.sendToUser(
				senderUserId,
				SocketEvent.MESSAGE_NEW,
				message,
				excludeSocketId
			)
		} else {
			this.realtimeGateway.sendToChat(chatId, SocketEvent.MESSAGE_NEW, message, excludeSocketId)
		}

		if (online.length > 0) {
			this.realtimeGateway.sendToUsersExceptChat(
				online,
				chatId,
				SocketEvent.MESSAGE_NEW,
				message,
				excludeSocketId
			)
		}

		if (offline.length > 0) {
			await this.pushService.sendToUsers(offline, {
				title: 'Новое сообщение',
				body: message.text || 'Вложение',
				chatId: message.chatId.toString()
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

	private async cleanupOldReadReceipts(): Promise<void> {
		const now = Date.now()
		if (now - this.lastCleanupTime < this.CLEANUP_INTERVAL_MS) return
		this.lastCleanupTime = now

		const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
		try {
			await this.prisma.messageRead.deleteMany({
				where: { readAt: { lt: sevenDaysAgo } }
			})
		} catch (e) {
			// ignore cleanup errors
		}
	}
}

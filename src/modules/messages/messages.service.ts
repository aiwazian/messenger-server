import {
	ForbiddenException,
	forwardRef,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { ChatsService } from '../chats/chats.service'
import {
	MessageAttachmentDto,
	MessageReadInfoDto,
	MessageReplyPreviewDto,
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
import { AttachmentType, MessageType, SystemEventType } from '../../generated/prisma/enums'
import { ChatType } from '../../common/enums/chat-type.enum'
import { SocketEvent } from '../../common/socket/socket-events'
import { Prisma } from '../../generated/prisma/client'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { EncryptionService } from '../encryption/encryption.service'
import { DeleteMessageDto } from './dto/delete-message.dto'
import { EditMessageDto } from './dto/edit-message.dto'
import { MESSAGE_INCLUDE, MessageWithRelations } from './message-include.const'
import { ChatSourceMap, ChatSourceResolver } from './chat-source.resolver'
import { ForwardSourceAccess } from '../../common/enums/forward-source-access.enum'
import { ChatReadStateService } from '../chat-read-state/chat-read-state.service'
import { MessageReadEntry, MessageReadsStore } from '../chat-read-state/message-reads.store'

/**
 * Сколько времени есть на правку отправленного сообщения.
 *
 * Сутки в личных чатах и группах: собеседник уже прочитал сообщение, и подмена
 * смысла задним числом — это уже не исправление опечатки. В каналах ограничения
 * нет: там пост живёт как публикация и правится в любой момент.
 */
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Данные о прочтении для одной страницы истории.
 *
 * Считается один раз на страницу: два курсора, один pipeline в Redis и один запрос
 * за именами читателей. Иначе каждое сообщение тянуло бы за собой свои запросы.
 */
export interface MessageReadContext {
	/** Курсор самого пользователя: до какого сообщения он дочитал чат. */
	myCursor: bigint
	/** Самый дальний курсор остальных: прочитано ли моё сообщение хоть кем-то. */
	peerCursor: bigint
	/** Читатели своих сообщений: id сообщения -> отметки от свежих к старым. */
	reads: Map<string, MessageReadEntry[]>
	/** Имена читателей для карточек в списке просмотров. */
	readerNames: Map<string, { firstName: string | null; lastName: string | null }>
}

@Injectable()
export class MessagesService {
	constructor(
		private readonly prisma: PrismaService,
		@Inject(forwardRef(() => ChatsService))
		private readonly chatsService: ChatsService,
		private readonly pushService: PushService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly storageService: StorageService,
		private readonly encryption: EncryptionService,
		private readonly chatSourceResolver: ChatSourceResolver,
		private readonly chatReadState: ChatReadStateService,
		private readonly messageReads: MessageReadsStore
	) {}

	/**
	 * Инициализация загрузки вложения.
	 *
	 * Категорию здесь задаёт клиент: в чат можно отправить и картинку, и видео,
	 * и произвольный документ. Соответствие заявленного и фактического типа
	 * проверяет хранилище: сначала политикой S3, потом по сигнатуре файла.
	 */
	async initFileUpload(userId: UserId, chatId: ChatId, dto: FileInitDto) {
		await this.chatsService.create(userId, chatId)
		return this.storageService.initUpload({
			...dto,
			directory: FileType.CHAT_ATTACHMENT
		})
	}

	async confirmFileUpload(
		userId: UserId,
		chatId: ChatId,
		dto: FileConfirmDto,
		excludeSocketId: string
	): Promise<MessageResponseDto> {
		await this.chatsService.create(userId, chatId)

		let replyToId: bigint | null = null
		if (dto.replyToId) {
			const target = await this.prisma.message.findFirst({
				where: {
					AND: [this.buildChatMessagesWhere(userId, chatId), { id: BigInt(dto.replyToId) }]
				},
				select: { id: true }
			})

			if (!target) throw new NotFoundException('Reply target not found')
			replyToId = target.id
		}

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
				replyToId,
				replyToChatId: replyToId ? chatId : null,
				attachments: {
					createMany: {
						data: attachmentsToCreate
					}
				}
			},
			include: MESSAGE_INCLUDE
		})

		const sources = await this.resolveSources(userId, [message])
		const chatType = detectChatType(chatId)
		const messageInstance = this.mapMessageToDto(message, userId, chatType, sources)
		messageInstance.text = dto.text

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
		const chatType = detectChatType(chatId)

		const messages = await this.prisma.message.findMany({
			where: this.buildChatMessagesWhere(userId, chatId),
			include: MESSAGE_INCLUDE,
			orderBy: { id: 'desc' },
			take: limit,
			skip: offset
		})

		const ordered = messages.reverse()
		const sources = await this.resolveSources(userId, ordered)
		const readContext = await this.resolveReadContext(userId, chatId, ordered)

		return ordered.map((message) =>
			this.mapMessageToDto(message, userId, chatType, sources, readContext)
		)
	}

	/**
	 * Единый where для сообщений чата.
	 *
	 * В приватном чате сообщения лежат двумя «сторонами» (chatId и senderId меняются
	 * местами), плюс всегда отсекаем скрытые лично для пользователя (deletedFor).
	 * Критично для окна: границы hasMoreBefore/hasMoreAfter должны считаться по тем же
	 * видимым сообщениям, что и сама выборка.
	 */
	buildChatMessagesWhere(userId: UserId, chatId: ChatId): Prisma.MessageWhereInput {
		const chatType = detectChatType(chatId)

		if (chatType === ChatType.PRIVATE) {
			return {
				OR: [
					{ senderId: userId, chatId: chatId },
					{ senderId: chatId, chatId: userId }
				],
				deletedFor: { none: { userId: userId } }
			}
		}

		return {
			chatId: chatId,
			deletedFor: { none: { userId: userId } }
		}
	}

	/** Расшифровка текста именно той версией ключа, которой он был зашифрован. */
	decryptText(text: string | null, version?: number | null): string | null {
		if (!text) return null

		try {
			return this.encryption.decrypt(text, version ?? this.encryption.currentVersion)
		} catch {
			return null
		}
	}

	/**
	 * Названия и права доступа для чатов-источников (пересылка + ответы из других чатов).
	 *
	 * Один батч на страницу истории: иначе на 50 сообщений получили бы до 100 запросов.
	 */
	async resolveSources(userId: UserId, messages: MessageWithRelations[]): Promise<ChatSourceMap> {
		const ids: Array<bigint | null> = []

		for (const message of messages) {
			ids.push(message.forwardedFromChatId)
			if (message.replyTo) ids.push(message.replyTo.chatId)
		}

		return this.chatSourceResolver.resolve(userId, ids)
	}

	/**
	 * Контекст прочтения для страницы истории.
	 *
	 * Подробности из Redis запрашиваются только для своих сообщений: список просмотров
	 * всё равно уходит только автору. В канале нет ни галочек, ни просмотров,
	 * поэтому запросы не делаются вовсе.
	 */
	async resolveReadContext(
		userId: UserId,
		chatId: ChatId,
		messages: MessageWithRelations[]
	): Promise<MessageReadContext> {
		const context: MessageReadContext = {
			myCursor: 0n,
			peerCursor: 0n,
			reads: new Map(),
			readerNames: new Map()
		}

		if (messages.length === 0) return context
		if (detectChatType(chatId) === ChatType.CHANNEL) return context

		const [myCursor, peerCursor] = await Promise.all([
			this.chatReadState.getCursor(userId, chatId),
			this.chatReadState.getPeerCursor(userId, chatId)
		])

		context.myCursor = myCursor
		context.peerCursor = peerCursor

		const myMessageIds = messages
			.filter((message) => BigInt(message.senderId) === BigInt(userId))
			.map((message) => message.id)

		context.reads = await this.messageReads.get(myMessageIds)

		const readerIds = new Set<bigint>()
		for (const entries of context.reads.values()) {
			for (const entry of entries) readerIds.add(entry.userId)
		}

		if (readerIds.size > 0) {
			const readers = await this.prisma.user.findMany({
				where: { id: { in: Array.from(readerIds) } },
				select: { id: true, firstName: true, lastName: true }
			})

			for (const reader of readers) {
				context.readerNames.set(reader.id.toString(), {
					firstName: reader.firstName,
					lastName: reader.lastName
				})
			}
		}

		return context
	}

	/** Единый маппер Message -> MessageResponseDto для всех способов загрузки истории. */
	mapMessageToDto(
		message: MessageWithRelations,
		userId: UserId,
		chatType: ChatType,
		sources?: ChatSourceMap,
		readContext?: MessageReadContext
	): MessageResponseDto {
		const isMine = BigInt(message.senderId) === BigInt(userId)

		let isRead: boolean | undefined
		let readInfo: MessageReadInfoDto[] | undefined

		if (chatType !== ChatType.CHANNEL) {
			/*
			 * Статус считается по курсору, а не по отметкам из Redis: подробности живут трое
			 * суток, а галочка должна остаться на сообщении навсегда. Своё сообщение
			 * прочитано, если его прочитал кто-то другой; чужое — если его прочитал
			 * сам пользователь.
			 */
			const cursor = isMine ? (readContext?.peerCursor ?? 0n) : (readContext?.myCursor ?? 0n)

			isRead = cursor >= message.id

			if (isMine) readInfo = this.buildReadInfo(message.id, readContext)
		}

		const replyChatType = message.replyTo
			? detectChatType(ChatId(message.replyTo.chatId))
			: undefined

		const replySource = message.replyTo
			? sources?.get(message.replyTo.chatId.toString())
			: undefined

		const replySenderName = message.replyTo
			? `${message.replyTo.sender.firstName ?? ''} ${message.replyTo.sender.lastName ?? ''}`.trim()
			: ''

		const replyTo = message.replyTo
			? plainToInstance(MessageReplyPreviewDto, {
					id: message.replyTo.id,
					senderId:
						replyChatType === ChatType.CHANNEL ? message.replyTo.chatId : message.replyTo.senderId,
					chatId: message.replyTo.chatId,
					text: this.decryptText(message.replyTo.text, message.replyTo.encryptionKeyVersion),
					messageType: message.replyTo.messageType,
					senderName: replySenderName || undefined,
					chatName: replyChatType === ChatType.PRIVATE ? undefined : replySource?.name || undefined,
					attachmentTypes:
						message.replyTo.attachments.length > 0
							? message.replyTo.attachments.map((a) => a.type)
							: undefined
				})
			: undefined

		const forwardSource = message.forwardedFromChatId
			? (sources?.get(message.forwardedFromChatId.toString()) ?? {
					name: '',
					access: ForwardSourceAccess.UNAVAILABLE
				})
			: undefined

		return plainToInstance(MessageResponseDto, {
			...message,
			text: this.decryptText(message.text, message.encryptionKeyVersion),
			isRead,
			readInfo,
			systemEventType: message.systemEvent?.eventType,
			attachments: message.attachments.map((f) =>
				plainToInstance(MessageAttachmentDto, { ...f.file, fileId: f.fileId, type: f.type })
			),
			senderId: chatType === ChatType.CHANNEL ? message.chatId : message.senderId,
			messageType: message.messageType,
			replyToId: message.replyToId,
			replyToChatId: message.replyToChatId,
			forwardedFromChatId: message.forwardedFromChatId,
			forwardedFromName: forwardSource?.name || undefined,
			forwardedFromAccess: forwardSource?.access,
			replyTo
		})
	}

	/**
	 * Список просмотров сообщения: кто и когда прочитал.
	 *
	 * Уходит только автору и только пока подробности живы в Redis: дальше у сообщения
	 * остаётся одна галочка «прочитано» без имён и времени.
	 */
	private buildReadInfo(
		messageId: bigint,
		readContext?: MessageReadContext
	): MessageReadInfoDto[] | undefined {
		const entries = readContext?.reads.get(messageId.toString())
		if (!entries || entries.length === 0) return undefined

		return entries.map((entry) => {
			const reader = readContext?.readerNames.get(entry.userId.toString())

			return plainToInstance(MessageReadInfoDto, {
				userId: entry.userId,
				firstName: reader?.firstName,
				lastName: reader?.lastName,
				readAt: entry.readAt
			})
		})
	}

	/**
	 * Прочитано всё до messageId включительно.
	 *
	 * Раньше здесь в цикле делался upsert на каждое ранее отправленное сообщение
	 * автора — на длинной истории это тысячи запросов на один просмотр.
	 * Теперь всё сводится к курсору в ChatReadState.
	 */
	async markRead(userId: UserId, messageId: number): Promise<void> {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: { chatId: true, senderId: true }
		})

		if (!message) throw new NotFoundException('Message not found')

		await this.chatReadState.markReadUpTo(
			userId,
			this.resolveUserFacingChatId(userId, message),
			BigInt(messageId)
		)
	}

	async markAllRead(userId: UserId, chatId: ChatId): Promise<void> {
		await this.chatReadState.markReadUpTo(userId, chatId)
	}

	/**
	 * В личном чате Message.chatId — это получатель, а не «чат» в терминах UI.
	 * Для читателя чатом является собеседник, то есть автор сообщения.
	 */
	private resolveUserFacingChatId(
		userId: UserId,
		message: { chatId: bigint; senderId: bigint }
	): ChatId {
		if (detectChatType(ChatId(message.chatId)) !== ChatType.PRIVATE) {
			return ChatId(message.chatId)
		}

		return BigInt(message.chatId) === BigInt(userId)
			? ChatId(message.senderId)
			: ChatId(message.chatId)
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
				await this.deleteMessageWithFiles(messageId)
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
			await this.deleteMessageWithFiles(messageId)
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

	async editMessage(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		dto: EditMessageDto,
		excludeSocketId: string
	): Promise<MessageResponseDto> {
		const chatType = detectChatType(chatId)

		await this.assertEditable(chatType, messageId)

		const now = Date.now()
		const { encrypted, version } = this.encryption.encrypt(dto.text)

		const message = await this.prisma.message.update({
			where: { id: messageId },
			data: {
				text: encrypted,
				editedAt: now,
				encryptionKeyVersion: version
			},
			include: {
				attachments: { include: { file: true } }
			}
		})

		const messageInstance = plainToInstance(MessageResponseDto, {
			...message,
			text: dto.text,
			isRead: undefined,
			attachments: message.attachments.map((f) =>
				plainToInstance(MessageAttachmentDto, { ...f.file, fileId: f.fileId, type: f.type })
			),
			senderId: chatType === ChatType.CHANNEL ? message.chatId : message.senderId,
			messageType: message.messageType
		})

		if (BigInt(chatId) === BigInt(userId)) {
			this.realtimeGateway.sendToUser(
				userId,
				SocketEvent.MESSAGE_EDIT,
				messageInstance,
				excludeSocketId
			)
		} else {
			this.realtimeGateway.sendToChat(
				chatId,
				SocketEvent.MESSAGE_EDIT,
				messageInstance,
				excludeSocketId
			)
		}

		const recipients = await this.getRecipients(userId, chatId, chatType)
		if (recipients.length > 0) {
			this.realtimeGateway.sendToUsersExceptChat(
				recipients,
				chatId,
				SocketEvent.MESSAGE_EDIT,
				messageInstance,
				excludeSocketId
			)
		}

		return messageInstance
	}

	/**
	 * Можно ли ещё править это сообщение.
	 *
	 * В личном чате и группе — сутки с момента отправки, в канале — всегда.
	 * Срок считается от sendTime, а не от предыдущей правки: иначе правка каждые
	 * двадцать три часа продлевала бы окно бесконечно.
	 *
	 * Проверка обязательно на сервере: скрытый в интерфейсе пункт меню — это не
	 * ограничение, запрос можно отправить напрямую.
	 */
	private async assertEditable(chatType: ChatType, messageId: number): Promise<void> {
		if (chatType === ChatType.CHANNEL) return

		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: { sendTime: true }
		})

		if (!message) throw new NotFoundException('Message not found')

		if (Date.now() - Number(message.sendTime) > EDIT_WINDOW_MS) {
			throw new ForbiddenException('Message can be edited within 24 hours after sending')
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

			await this.prisma.message.deleteMany({ where: messageWhere })

			await this.releaseFiles(
				messages.flatMap((message) => message.attachments.map((f) => f.fileId))
			)
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

		await this.chatReadState.recount(userId, chatId)

		if (isPrivateChat && clearForRecipient && recipients[0]) {
			await this.chatReadState.recount(recipients[0], ChatId(userId))
		}
	}

	/**
	 * Удаляет сообщение и освобождает его файлы.
	 *
	 * Пересланные копии ссылаются на те же File, поэтому безусловное удаление
	 * ломало бы вложения в чужих чатах.
	 */
	private async deleteMessageWithFiles(messageId: number): Promise<void> {
		const attachments = await this.prisma.messageAttachment.findMany({
			where: { messageId },
			select: { fileId: true }
		})

		await this.prisma.message.delete({ where: { id: messageId } })
		await this.messageReads.remove([BigInt(messageId)])
		await this.releaseFiles(attachments.map((a) => a.fileId))
	}

	/**
	 * Удаляет файлы, на которые не осталось ни одной ссылки.
	 *
	 * Сам подсчёт ссылок живёт в хранилище: раньше та же пятёрка count() была
	 * скопирована в двух местах, и новая связь с File легко терялась в одном из них.
	 */
	private async releaseFiles(fileIds: string[]): Promise<void> {
		for (const fileId of Array.from(new Set(fileIds))) {
			await this.storageService.releaseFile(fileId)
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

		await this.chatReadState.onNewMessage(chatId, BigInt(message.id), recipients)

		/*
		 * Отправка закрывает непрочитанные в этом же чате — и для обычного сообщения,
		 * и для пересылки, и для вложения: все три пути сходятся здесь, поэтому
		 * правило живёт в одном месте, а не в каждом use-case отдельно.
		 */
		await this.chatReadState.markReadOnSend(senderUserId, chatId, BigInt(message.id))

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
			const actualChatId = chatType === ChatType.CHANNEL ? message.chatId : message.senderId
			this.pushService.sendToUsers(offline, {
				title: 'Новое сообщение',
				body: message.text || 'Вложение',
				chatId: actualChatId.toString()
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

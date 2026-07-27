import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { Prisma } from '../../generated/prisma/client'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SocketEvent } from '../../common/socket/socket-events'
import { ChatReadStateDto } from './dto/chat-read-state.dto'

/**
 * Счётчик непрочитанных и курсор прочтения.
 *
 * Почему отдельный модуль, а не часть MessagesService: состояние прочтения нужно
 * и в списке чатов (ChatsService), и в сообщениях; общий модуль избавляет от ещё одного
 * кругового forwardRef между ними.
 *
 * Каналы тоже считаются: бейдж нужен, но галочки «прочитано» автору не рассылаются
 * и MessageRead для них не пишется — иначе на канале с сотней тысяч подписчиков
 * таблица растёт на каждый просмотр.
 *
 * Важное правило про chatId в личных чатах: id пользователя совпадает с id его чата,
 * поэтому один и тот же диалог у собеседников называется по-разному. Олег (id 1) пишет
 * «в чат 2», а для Андрея (id 2) это чат 1. Все события наружу отправляются в системе
 * координат получателя события, иначе непрочитанные и галочки уезжают в «Избранное».
 */
@Injectable()
export class ChatReadStateService {
	constructor(
		private readonly prisma: PrismaService,
		@Inject(forwardRef(() => RealtimeGateway))
		private readonly realtimeGateway: RealtimeGateway
	) { }

	/** Состояния сразу по всем чатам пользователя: список чатов грузится одним запросом. */
	async getStates(userId: UserId): Promise<Map<string, ChatReadStateDto>> {
		const rows = await this.prisma.chatReadState.findMany({ where: { userId } })

		return new Map(rows.map((row) => [row.chatId.toString(), this.toDto(row)]))
	}

	async getState(userId: UserId, chatId: ChatId): Promise<ChatReadStateDto> {
		const row = await this.prisma.chatReadState.findUnique({
			where: { userId_chatId: { userId, chatId } }
		})

		if (row) return this.toDto(row)

		return plainToInstance(ChatReadStateDto, {
			chatId: chatId.toString(),
			unreadCount: 0
		})
	}

	/**
	 * Новое сообщение в чате: +1 каждому получателю.
	 *
	 * Счётчик инкрементится атомарно (increment), а не через чтение-запись:
	 * два одновременных сообщения иначе дали бы +1 вместо +2.
	 *
	 * chatId приходит в системе координат отправителя, поэтому для личного чата он
	 * пересчитывается в id автора сообщения — это и есть чат получателя.
	 */
	async onNewMessage(chatId: ChatId, messageId: bigint, recipientIds: UserId[]): Promise<void> {
		if (recipientIds.length === 0) return

		const targetChatId = await this.resolveRecipientChatId(chatId, messageId)
		const now = Date.now()

		await Promise.all(
			recipientIds.map(async (userId) => {
				try {
					await this.prisma.chatReadState.upsert({
						where: { userId_chatId: { userId, chatId: targetChatId } },
						create: {
							userId,
							chatId: targetChatId,
							unreadCount: 1,
							firstUnreadMessageId: messageId,
							updatedAt: now
						},
						update: {
							unreadCount: { increment: 1 },
							updatedAt: now
						}
					})

					await this.prisma.chatReadState.updateMany({
						where: { userId, chatId: targetChatId, firstUnreadMessageId: null },
						data: { firstUnreadMessageId: messageId }
					})

					const state = await this.getState(userId, targetChatId)
					this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, state)
				} catch {

				}
			})
		)
	}

	/**
	 * Отметить всё до upToMessageId включительно как прочитанное.
	 *
	 * Без upToMessageId — весь чат (кнопка «вниз» / прыжок к концу истории).
	 * Курсор только растёт: сообщения приходят из разных мест UI и могут прийти не по порядку.
	 */
	async markReadUpTo(
		userId: UserId,
		chatId: ChatId,
		upToMessageId?: bigint
	): Promise<ChatReadStateDto> {
		const chatType = detectChatType(chatId)
		const visibleWhere = this.visibleMessagesWhere(userId, chatId)

		const boundary = upToMessageId ?? (await this.lastMessageId(visibleWhere))
		if (boundary === null) return this.getState(userId, chatId)

		const existing = await this.prisma.chatReadState.findUnique({
			where: { userId_chatId: { userId, chatId } }
		})

		const previousCursor = existing?.lastReadMessageId ?? 0n
		const cursor = boundary > previousCursor ? boundary : previousCursor

		if (chatType !== ChatType.CHANNEL && cursor > previousCursor) {
			await this.createReceipts(userId, visibleWhere, previousCursor, cursor)
		}

		const unreadCount = await this.prisma.message.count({
			where: {
				AND: [visibleWhere, { id: { gt: cursor } }, { senderId: { not: userId } }]
			}
		})

		const firstUnread = await this.prisma.message.findFirst({
			where: {
				AND: [visibleWhere, { id: { gt: cursor } }, { senderId: { not: userId } }]
			},
			orderBy: { id: 'asc' },
			select: { id: true }
		})

		const now = Date.now()
		const row = await this.prisma.chatReadState.upsert({
			where: { userId_chatId: { userId, chatId } },
			create: {
				userId,
				chatId,
				lastReadMessageId: cursor,
				firstUnreadMessageId: firstUnread?.id ?? null,
				unreadCount,
				updatedAt: now
			},
			update: {
				lastReadMessageId: cursor,
				firstUnreadMessageId: firstUnread?.id ?? null,
				unreadCount,
				updatedAt: now
			}
		})

		const state = this.toDto(row)

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, state)

		if (chatType !== ChatType.CHANNEL && cursor > previousCursor) {
			await this.notifyRead(userId, chatId, chatType, cursor)
		}

		return state
	}

	/** Пересчёт по факту: после удаления сообщений или очистки истории счётчик может врать. */
	async recount(userId: UserId, chatId: ChatId): Promise<ChatReadStateDto> {
		const visibleWhere = this.visibleMessagesWhere(userId, chatId)
		const existing = await this.prisma.chatReadState.findUnique({
			where: { userId_chatId: { userId, chatId } }
		})
		const cursor = existing?.lastReadMessageId ?? 0n

		const unreadWhere = {
			AND: [visibleWhere, { id: { gt: cursor } }, { senderId: { not: userId } }]
		}

		const [unreadCount, firstUnread] = await Promise.all([
			this.prisma.message.count({ where: unreadWhere }),
			this.prisma.message.findFirst({
				where: unreadWhere,
				orderBy: { id: 'asc' },
				select: { id: true }
			})
		])

		const now = Date.now()
		const row = await this.prisma.chatReadState.upsert({
			where: { userId_chatId: { userId, chatId } },
			create: {
				userId,
				chatId,
				lastReadMessageId: existing?.lastReadMessageId ?? null,
				firstUnreadMessageId: firstUnread?.id ?? null,
				unreadCount,
				updatedAt: now
			},
			update: {
				firstUnreadMessageId: firstUnread?.id ?? null,
				unreadCount,
				updatedAt: now
			}
		})

		const state = this.toDto(row)
		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, state)

		return state
	}

	/** Удаление чата или выход из канала: счётчик больше не нужен. */
	async reset(userId: UserId, chatId: ChatId): Promise<void> {
		await this.prisma.chatReadState
			.deleteMany({ where: { userId, chatId } })
			.catch(() => undefined)

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, {
			chatId: chatId.toString(),
			unreadCount: 0
		})
	}

	/**
	 * chatId получателя для нового сообщения.
	 *
	 * Личный чат: получатель видит диалог как чат с автором сообщения.
	 * Группа и канал: chatId общий, пересчитывать нечего.
	 */
	private async resolveRecipientChatId(chatId: ChatId, messageId: bigint): Promise<ChatId> {
		if (detectChatType(chatId) !== ChatType.PRIVATE) return chatId

		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: { senderId: true }
		})

		if (!message) return chatId

		return ChatId(message.senderId)
	}

	/**
	 * Те же правила видимости, что в MessagesService.buildChatMessagesWhere.
	 *
	 * Дублируется осознанно: иначе модуль состояния прочтения зависит от MessagesService,
	 * а тот зависит от него — цикл.
	 */
	private visibleMessagesWhere(userId: UserId, chatId: ChatId): Prisma.MessageWhereInput {
		if (detectChatType(chatId) === ChatType.PRIVATE) {
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

	private async lastMessageId(where: Prisma.MessageWhereInput): Promise<bigint | null> {
		const last = await this.prisma.message.findFirst({
			where,
			orderBy: { id: 'desc' },
			select: { id: true }
		})

		return last?.id ?? null
	}

	/** MessageRead пишется пачкой и только на новый диапазон, а не по всей истории чата. */
	private async createReceipts(
		userId: UserId,
		visibleWhere: Prisma.MessageWhereInput,
		fromExclusive: bigint,
		toInclusive: bigint
	): Promise<void> {
		const messages = await this.prisma.message.findMany({
			where: {
				AND: [
					visibleWhere,
					{ id: { gt: fromExclusive, lte: toInclusive } },
					{ senderId: { not: userId } },
					{ readReceipts: { none: { userId } } }
				]
			},
			select: { id: true }
		})

		if (messages.length === 0) return

		const now = Date.now()
		await this.prisma.messageRead.createMany({
			data: messages.map((message) => ({ messageId: message.id, userId, readAt: now })),
			skipDuplicates: true
		})
	}

	/** Событие chat:read автору (личный чат) или всем участникам (группа). */
	private async notifyRead(
		userId: UserId,
		chatId: ChatId,
		chatType: ChatType,
		cursor: bigint
	): Promise<void> {
		const message = await this.prisma.message.findUnique({
			where: { id: cursor },
			select: { id: true, senderId: true, sendTime: true }
		})

		if (!message) return

		const payload = {
			chatId: chatId.toString(),
			messageId: message.id.toString(),
			userId: userId.toString(),
			time: Date.now().toString(),
			senderId: message.senderId.toString(),
			sendTime: message.sendTime.toString()
		}

		if (chatType === ChatType.PRIVATE) {
			// Автор берётся из самого сообщения: chatId здесь — координаты читателя,
			// и при чтении собственного сообщения («Избранное») уведомлять некого.
			const author = UserId(message.senderId)
			if (author === userId) return

			// Для автора этот диалог — чат с читателем, поэтому chatId переворачивается.
			this.realtimeGateway.sendToUser(author, SocketEvent.CHAT_READ, {
				...payload,
				chatId: userId.toString()
			})
			return
		}

		if (chatType === ChatType.GROUP) {
			const members = await this.prisma.groupMember.findMany({
				where: { groupId: chatId },
				select: { userId: true }
			})

			for (const member of members) {
				const recipient = UserId(member.userId)
				if (recipient === userId) continue
				this.realtimeGateway.sendToUser(recipient, SocketEvent.CHAT_READ, payload)
			}
		}
	}

	private toDto(row: {
		chatId: bigint
		unreadCount: number
		lastReadMessageId: bigint | null
		firstUnreadMessageId: bigint | null
	}): ChatReadStateDto {
		return plainToInstance(ChatReadStateDto, {
			chatId: row.chatId.toString(),
			unreadCount: row.unreadCount,
			lastReadMessageId: row.lastReadMessageId?.toString() ?? null,
			firstUnreadMessageId: row.firstUnreadMessageId?.toString() ?? null
		})
	}
}

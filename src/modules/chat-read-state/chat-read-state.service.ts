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
import { MessageReadsStore } from './message-reads.store'

/**
 * Счётчик непрочитанных и курсор прочтения.
 *
 * Почему отдельный модуль, а не часть MessagesService: состояние прочтения нужно
 * и в списке чатов (ChatsService), и в сообщениях; общий модуль избавляет от ещё одного
 * кругового forwardRef между ними.
 *
 * Курсор — долговременный источник правды о том, прочитано сообщение или нет.
 * Подробности «кто и когда» живут отдельно и недолго (см. MessageReadsStore),
 * поэтому галочки считаются именно по курсору, а не по наличию отметок.
 *
 * Каналы тоже считаются: бейдж нужен, но галочки «прочитано» автору не рассылаются
 * и отметки о прочтении для них не пишутся — иначе на канале с сотней тысяч
 * подписчиков список читателей копился бы на каждый просмотр.
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
		private readonly realtimeGateway: RealtimeGateway,
		private readonly messageReads: MessageReadsStore
	) {}

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
			unreadCount: 0,
			isManuallyUnread: false
		})
	}

	/** Курсор одного пользователя в чате: 0 означает «не прочитал ничего». */
	async getCursor(userId: UserId, chatId: ChatId): Promise<bigint> {
		const row = await this.prisma.chatReadState.findUnique({
			where: { userId_chatId: { userId, chatId } },
			select: { lastReadMessageId: true }
		})

		return row?.lastReadMessageId ?? 0n
	}

	/**
	 * Самый дальний курсор всех участников чата, кроме самого пользователя.
	 *
	 * Отвечает на вопрос «прочитал ли моё сообщение хоть кто-то» и заменяет прежний
	 * подсчёт отметок: курсор живёт вечно, поэтому галочка не пропадает вместе
	 * с TTL подробностей в Redis.
	 *
	 * В личном чате тот же диалог у собеседника называется иначе — его строка
	 * состояния лежит под chatId, равным id пользователя.
	 */
	async getPeerCursor(userId: UserId, chatId: ChatId): Promise<bigint> {
		const chatType = detectChatType(chatId)

		if (chatType === ChatType.PRIVATE) {
			// «Избранное»: собеседника нет, читать сообщение некому.
			if (BigInt(chatId) === BigInt(userId)) return 0n

			return this.getCursor(UserId(chatId), ChatId(userId))
		}

		if (chatType === ChatType.GROUP) {
			const aggregate = await this.prisma.chatReadState.aggregate({
				where: { chatId, userId: { not: userId } },
				_max: { lastReadMessageId: true }
			})

			return aggregate._max.lastReadMessageId ?? 0n
		}

		return 0n
	}

	/**
	 * Прочитано ли одно конкретное сообщение.
	 *
	 * Для мест, где страницы истории нет и батчить нечего — например, последнее
	 * сообщение в списке чатов. Своё сообщение прочитано, если его прочитал кто-то
	 * другой; чужое — если его прочитал сам пользователь. В канале галочек нет.
	 */
	async isMessageRead(
		userId: UserId,
		chatId: ChatId,
		message: { id: bigint; senderId: bigint }
	): Promise<boolean | undefined> {
		if (detectChatType(chatId) === ChatType.CHANNEL) return undefined

		const cursor =
			BigInt(message.senderId) === BigInt(userId)
				? await this.getPeerCursor(userId, chatId)
				: await this.getCursor(userId, chatId)

		return cursor >= message.id
	}

	/**
	 * Новое сообщение в чате: +1 каждому получателю.
	 *
	 * Счётчик инкрементится атомарно (increment), а не через чтение-запись:
	 * два одновременных сообщения иначе дали бы +1 вместо +2.
	 *
	 * chatId приходит в системе координат отправителя, поэтому для личного чата он
	 * пересчитывается в id автора сообщения — это и есть чат получателя.
	 *
	 * Ручная пометка «непрочитанно» снимается: теперь есть настоящие непрочитанные
	 * и бейдж должен показывать число, а не пустоту.
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
							isManuallyUnread: false,
							updatedAt: now
						},
						update: {
							unreadCount: { increment: 1 },
							isManuallyUnread: false,
							updatedAt: now
						}
					})

					await this.prisma.chatReadState.updateMany({
						where: { userId, chatId: targetChatId, firstUnreadMessageId: null },
						data: { firstUnreadMessageId: messageId }
					})

					const state = await this.getState(userId, targetChatId)
					this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, state)
				} catch {}
			})
		)
	}

	/**
	 * Отметить всё до upToMessageId включительно как прочитанное.
	 *
	 * Без upToMessageId — весь чат (кнопка «вниз» / прыжок к концу истории).
	 * Курсор только растёт: сообщения приходят из разных мест UI и могут прийти не по порядку.
	 *
	 * excludeSocketId — сокет, с которого пришёл запрос: эта сессия уже обновила UI
	 * локально, событие ей не нужно — оно уходит только остальным сессиям пользователя.
	 */
	async markReadUpTo(
		userId: UserId,
		chatId: ChatId,
		upToMessageId?: bigint,
		excludeSocketId?: string
	): Promise<ChatReadStateDto> {
		const chatType = detectChatType(chatId)
		const visibleWhere = this.visibleMessagesWhere(userId, chatId)

		const boundary = upToMessageId ?? (await this.lastMessageId(visibleWhere))

		// В чате нет ни одного сообщения, но ручная пометка «непрочитанно» могла стоять:
		// состояние всё равно надо разослать, иначе бейдж на других устройствах не погаснет.
		if (boundary === null) {
			const state = await this.getState(userId, chatId)
			this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, state, excludeSocketId)

			return state
		}

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
				isManuallyUnread: false,
				updatedAt: now
			},
			update: {
				lastReadMessageId: cursor,
				firstUnreadMessageId: firstUnread?.id ?? null,
				unreadCount,
				isManuallyUnread: false,
				updatedAt: now
			}
		})

		const state = this.toDto(row)

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, state, excludeSocketId)

		if (chatType !== ChatType.CHANNEL && cursor > previousCursor) {
			await this.notifyRead(userId, chatId, chatType, cursor)
		}

		return state
	}

	/**
	 * Отправка сообщения — это тоже прочтение чата.
	 *
	 * Человек физически видит то, на что отвечает, поэтому десяток непрочитанных
	 * под собственным ответом — заведомо неверное состояние. Курсор двигается до
	 * только что отправленного сообщения, а собеседники получают галочки: для них
	 * это обычное прочтение.
	 *
	 * Ошибка здесь не должна ломать отправку — сообщение уже создано и разослано,
	 * а счётчик в худшем случае пересчитается при следующем открытии чата.
	 */
	async markReadOnSend(userId: UserId, chatId: ChatId, messageId: bigint): Promise<void> {
		try {
			await this.markReadUpTo(userId, chatId, messageId)
		} catch {}
	}

	/**
	 * Пометить пачку чатов прочитанными — меню выделения на главном экране.
	 *
	 * Идёт через markReadUpTo, а не отдельным updateMany: нужны и отметки
	 * о прочтении, и chat:read собеседникам — для них это обычное прочтение.
	 *
	 * Последовательно, а не Promise.all: каждый чат — это пачка отметок,
	 * и параллельный запуск на десятке выделенных чатов забивает пул соединений.
	 */
	async markChatsRead(
		userId: UserId,
		chatIds: ChatId[],
		excludeSocketId?: string
	): Promise<ChatReadStateDto[]> {
		const states: ChatReadStateDto[] = []

		for (const chatId of chatIds) {
			await this.prisma.chatReadState.updateMany({
				where: { userId, chatId, isManuallyUnread: true },
				data: { isManuallyUnread: false, updatedAt: Date.now() }
			})

			states.push(await this.markReadUpTo(userId, chatId, undefined, excludeSocketId))
		}

		return states
	}

	/**
	 * Пометить пачку чатов непрочитанными.
	 *
	 * Собеседникам ничего не отправляется и отметки о прочтении не трогаются: это
	 * личная пометка «вернуться позже», а не отмена уже отосланных галочек. Отозвать
	 * у автора уже показанное «прочитано» всё равно нельзя.
	 *
	 * Счётчик не трогается: если реальные непрочитанные есть — бейдж покажет их число,
	 * если нет — клиент нарисует пустой бейдж по флагу.
	 */
	async markChatsUnread(
		userId: UserId,
		chatIds: ChatId[],
		excludeSocketId?: string
	): Promise<ChatReadStateDto[]> {
		const now = Date.now()
		const states: ChatReadStateDto[] = []

		for (const chatId of chatIds) {
			const row = await this.prisma.chatReadState.upsert({
				where: { userId_chatId: { userId, chatId } },
				create: {
					userId,
					chatId,
					unreadCount: 0,
					isManuallyUnread: true,
					updatedAt: now
				},
				update: {
					isManuallyUnread: true,
					updatedAt: now
				}
			})

			const state = this.toDto(row)
			this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, state, excludeSocketId)
			states.push(state)
		}

		return states
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
		await this.prisma.chatReadState.deleteMany({ where: { userId, chatId } }).catch(() => undefined)

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UNREAD, {
			chatId: chatId.toString(),
			unreadCount: 0,
			isManuallyUnread: false
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

	/**
	 * Отметки о прочтении пишутся в Redis и только на новый диапазон.
	 *
	 * Раньше это была пачка строк в MessageRead плюс ночная чистка старше недели:
	 * таблица пухла на каждый просмотр, а потом массово удалялась. Подробность
	 * «кто и когда» нужна только у свежих сообщений, поэтому теперь она живёт
	 * в Redis с TTL, а долговременный статус остаётся курсором.
	 *
	 * Дедупликация ушла в ZADD NX — подзапрос «нет отметки этого пользователя»
	 * больше не нужен.
	 */
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
					{ senderId: { not: userId } }
				]
			},
			select: { id: true, sendTime: true }
		})

		if (messages.length === 0) return

		await this.messageReads.add(messages, userId, Date.now())
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
			const author = UserId(message.senderId)
			if (author === userId) return

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
		isManuallyUnread?: boolean
	}): ChatReadStateDto {
		return plainToInstance(ChatReadStateDto, {
			chatId: row.chatId.toString(),
			unreadCount: row.unreadCount,
			lastReadMessageId: row.lastReadMessageId?.toString() ?? null,
			firstUnreadMessageId: row.firstUnreadMessageId?.toString() ?? null,
			isManuallyUnread: row.isManuallyUnread ?? false
		})
	}
}

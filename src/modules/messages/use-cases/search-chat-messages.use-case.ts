import { Injectable } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { MessageType } from '../../../generated/prisma/enums'
import { MessagesService } from '../messages.service'
import { SearchMessagesDto } from '../dto/search-messages.dto'
import { MessageSearchHitDto, MessageSearchResponseDto } from '../dto/message-search-response.dto'

/** Сколько строк тянем из БД за один шаг сканирования. */
const BATCH_SIZE = 500

/** Предел просмотренных сообщений за один запрос, чтобы не вешать сервер на огромном чате. */
const MAX_SCANNED_PER_REQUEST = 20_000

/**
 * Предел просмотренных сообщений при подсчёте общего числа совпадений.
 *
 * Считается один раз на первую страницу поиска, поэтому лимит выше страничного:
 * иначе клиенту нечего показать в «10 результатов» и «1 из 142».
 */
const MAX_SCANNED_FOR_TOTAL = 200_000

/** Условие видимости сообщений чата для текущего пользователя. */
type ChatMessagesWhere = ReturnType<MessagesService['buildChatMessagesWhere']>

/**
 * Поиск по сообщениям внутри чата.
 *
 * ВАЖНО: text в БД лежит зашифрованным (AES-256-GCM), поэтому поиск через
 * `text: { contains: ... }` работать НЕ будет в принципе. Поэтому сообщения сканируются
 * батчами от новых к старым, расшифровываются в памяти и фильтруются.
 * Клиенту возвращаются только id + текст; по тапу по результату он дергает
 * GET /messages/window?anchorId=<id>.
 */
@Injectable()
export class SearchChatMessagesUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly messagesService: MessagesService
	) {}

	async execute(
		userId: UserId,
		chatId: ChatId,
		dto: SearchMessagesDto
	): Promise<MessageSearchResponseDto> {
		const needle = dto.q.trim().toLowerCase()

		if (!needle) {
			return plainToInstance(MessageSearchResponseDto, {
				items: [],
				nextCursorId: null,
				scannedAll: true,
				total: 0,
				totalIsExact: true
			})
		}

		const baseWhere = this.messagesService.buildChatMessagesWhere(userId, chatId)

		let cursor: bigint | undefined = dto.cursorId ? BigInt(dto.cursorId) : undefined
		const items: MessageSearchHitDto[] = []
		let scanned = 0
		let scannedAll = false

		while (items.length < dto.limit && scanned < MAX_SCANNED_PER_REQUEST) {
			const batch = await this.prisma.message.findMany({
				where: {
					AND: [
						baseWhere,
						{ text: { not: null }, messageType: { not: MessageType.SYSTEM } },
						...(cursor ? [{ id: { lt: cursor } }] : [])
					]
				},
				orderBy: { id: 'desc' },
				take: BATCH_SIZE,
				select: {
					id: true,
					senderId: true,
					chatId: true,
					text: true,
					sendTime: true,
					encryptionKeyVersion: true
				}
			})

			if (batch.length === 0) {
				scannedAll = true
				break
			}

			scanned += batch.length
			cursor = batch[batch.length - 1].id

			for (const row of batch) {
				const text = this.messagesService.decryptText(row.text, row.encryptionKeyVersion)
				if (!text || !text.toLowerCase().includes(needle)) continue

				items.push(
					plainToInstance(MessageSearchHitDto, {
						id: row.id,
						senderId: row.senderId,
						text,
						sendTime: row.sendTime
					})
				)

				if (items.length >= dto.limit) {
					cursor = row.id
					break
				}
			}

			if (items.length < dto.limit && batch.length < BATCH_SIZE) {
				scannedAll = true
				break
			}
		}

		let total: number | null = null
		let totalIsExact: boolean | null = null

		/*
		 * Общее число совпадений считаем только на первой странице: клиент держит
		 * его у себя и на догрузках пересчитывать нечего.
		 */
		if (!dto.cursorId) {
			if (scannedAll) {
				/* История просмотрена целиком — найденное и есть всё. */
				total = items.length
				totalIsExact = true
			} else {
				const rest = await this.countMatches(baseWhere, needle, cursor)
				total = items.length + rest.matches
				totalIsExact = rest.scannedAll
			}
		}

		return plainToInstance(MessageSearchResponseDto, {
			items,
			nextCursorId: scannedAll ? null : (cursor ?? null),
			scannedAll,
			total,
			totalIsExact
		})
	}

	/**
	 * Досчитывает совпадения от курсора до конца истории.
	 *
	 * Проход отдельный и намеренно «пустой»: расшифровка та же, но в память,
	 * кроме счётчика, ничего не складывается, поэтому десятки тысяч совпадений
	 * стоят столько же, сколько одно.
	 */
	private async countMatches(
		baseWhere: ChatMessagesWhere,
		needle: string,
		startCursor: bigint | undefined
	): Promise<{ matches: number; scannedAll: boolean }> {
		let cursor = startCursor
		let matches = 0
		let scanned = 0

		while (scanned < MAX_SCANNED_FOR_TOTAL) {
			const batch = await this.prisma.message.findMany({
				where: {
					AND: [
						baseWhere,
						{ text: { not: null }, messageType: { not: MessageType.SYSTEM } },
						...(cursor ? [{ id: { lt: cursor } }] : [])
					]
				},
				orderBy: { id: 'desc' },
				take: BATCH_SIZE,
				select: {
					id: true,
					text: true,
					encryptionKeyVersion: true
				}
			})

			if (batch.length === 0) return { matches, scannedAll: true }

			scanned += batch.length
			cursor = batch[batch.length - 1].id

			for (const row of batch) {
				const text = this.messagesService.decryptText(row.text, row.encryptionKeyVersion)
				if (text && text.toLowerCase().includes(needle)) matches++
			}

			if (batch.length < BATCH_SIZE) return { matches, scannedAll: true }
		}

		return { matches, scannedAll: false }
	}
}

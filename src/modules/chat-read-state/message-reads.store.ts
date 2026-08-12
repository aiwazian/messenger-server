import { Inject, Injectable } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../providers/redis/redis.module'

/**
 * Сколько живёт подробность «кто и когда прочитал сообщение».
 *
 * Через трое суток остаётся только сам факт прочтения: он считается по курсору
 * в ChatReadState и живёт вечно. Точное время нужно ровно для списка просмотров
 * у свежих сообщений, поэтому в Postgres ему делать нечего.
 */
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000

const KEY_PREFIX = 'message-reads'

/** Одна отметка: кто прочитал и когда. */
export interface MessageReadEntry {
	userId: bigint
	readAt: number
}

/** Сообщение, которому нужны отметки: срок хранения считается от времени отправки. */
export interface ReadableMessage {
	id: bigint
	sendTime: bigint
}

/*
 * Отметки о прочтении конкретных сообщений.
 *
 * Каждое сообщение — отдельный ZSET: элемент это читатель, score — время прочтения.
 * Почему ZSET, а не хеш: список просмотров показывается от свежих к старым, и
 * ZREVRANGE отдаёт его уже отсортированным, а ZADD NX заодно делает дедупликацию,
 * которая раньше была отдельным подзапросом «нет отметки этого пользователя».
 *
 * TTL считается от времени отправки сообщения, а не от последнего прочтения.
 * Скользящий TTL продлевал бы жизнь популярного сообщения бесконечно, и хуже:
 * часть читателей уже протухла бы, а часть нет, то есть счётчик просмотров начал
 * бы врать. При общем сроке список исчезает целиком и одновременно.
 *
 * Данные намеренно эфемерные. Потеря Redis стирает время прочтения, но не статус
 * «прочитано» — он остаётся курсором в Postgres, поэтому галочки у старых
 * сообщений никуда не денутся.
 */
@Injectable()
export class MessageReadsStore {
	constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

	private key(messageId: bigint): string {
		return `${KEY_PREFIX}:${messageId.toString()}`
	}

	/** Момент удаления ключа в секундах: формат EXPIREAT. */
	private expiresAt(sendTime: bigint): number {
		return Math.ceil((Number(sendTime) + RETENTION_MS) / 1000)
	}

	/**
	 * Отмечает пачку сообщений прочитанными одним пользователем.
	 *
	 * Сообщения старше срока хранения отбрасываются заранее: EXPIREAT с прошедшей
	 * датой удалил бы ключ сразу же, то есть запись всё равно потерялась бы.
	 *
	 * NX не даёт перезаписать существующую отметку — настоящим считается первое
	 * прочтение, повторный вход в чат не должен сдвигать время вперёд.
	 */
	async add(messages: ReadableMessage[], userId: bigint, readAt: number): Promise<void> {
		const now = Date.now()
		const fresh = messages.filter((message) => Number(message.sendTime) + RETENTION_MS > now)

		if (fresh.length === 0) return

		const pipeline = this.redis.pipeline()

		for (const message of fresh) {
			const key = this.key(message.id)
			pipeline.zadd(key, 'NX', readAt, userId.toString())
			pipeline.expireat(key, this.expiresAt(message.sendTime))
		}

		try {
			await pipeline.exec()
		} catch {
			/*
			 * Недоступный Redis не должен ломать открытие чата: потеряется время
			 * прочтения, но курсор и счётчик непрочитанных живут в Postgres
			 * и обновятся как обычно.
			 */
		}
	}

	/**
	 * Читатели пачки сообщений, от свежих к старым.
	 *
	 * Один pipeline на всю страницу истории: иначе пятьдесят сообщений превратились
	 * бы в пятьдесят отдельных обращений к Redis.
	 */
	async get(messageIds: bigint[]): Promise<Map<string, MessageReadEntry[]>> {
		const result = new Map<string, MessageReadEntry[]>()

		if (messageIds.length === 0) return result

		const pipeline = this.redis.pipeline()

		for (const messageId of messageIds) {
			pipeline.zrevrange(this.key(messageId), 0, -1, 'WITHSCORES')
		}

		let responses: Array<[Error | null, unknown]> | null = null

		try {
			responses = await pipeline.exec()
		} catch {
			return result
		}

		messageIds.forEach((messageId, index) => {
			const response = responses?.[index]
			if (!response || response[0]) return

			const flat = (response[1] as string[] | null) ?? []
			const entries: MessageReadEntry[] = []

			// ZREVRANGE WITHSCORES отдаёт плоский список: элемент, score, элемент, score.
			for (let i = 0; i + 1 < flat.length; i += 2) {
				entries.push({ userId: BigInt(flat[i]), readAt: Number(flat[i + 1]) })
			}

			if (entries.length > 0) result.set(messageId.toString(), entries)
		})

		return result
	}

	/** Сообщение удалено — список его читателей больше не нужен. */
	async remove(messageIds: bigint[]): Promise<void> {
		if (messageIds.length === 0) return

		try {
			await this.redis.del(...messageIds.map((messageId) => this.key(messageId)))
		} catch {}
	}
}

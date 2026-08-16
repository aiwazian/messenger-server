import { Inject, Injectable } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../providers/redis/redis.module'

/**
 * Сколько живёт точное время правки сообщения.
 *
 * Через трое суток остаётся только флаг Message.isEdited: подпись «изменено»
 * должна висеть на сообщении всегда, а «изменено в 14:42» интересно ровно у свежих
 * сообщений, поэтому в Postgres этому времени делать нечего.
 */
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000

const KEY_PREFIX = 'message-edits'

/*
 * Время последней правки сообщения.
 *
 * Ключ на сообщение, значение — время в миллисекундах. Обычная строка, а не ZSET
 * как у отметок о прочтении: у правки нет списка участников, хранить нечего кроме
 * последнего времени, и GET дешевле любой структуры.
 *
 * Срок считается от самой правки, а не от отправки сообщения, как у отметок о
 * прочтении: сутки на правку есть только в чатах и группах, а пост в канале
 * правится когда угодно — при отсчёте от sendTime свежая правка годовалого поста
 * протухла бы мгновенно.
 *
 * Данные намеренно эфемерные. Потеря Redis стирает время правки, но не сам факт:
 * он лежит в Postgres, поэтому подпись «изменено» у сообщения останется.
 */
@Injectable()
export class MessageEditsStore {
	constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

	private key(messageId: bigint): string {
		return `${KEY_PREFIX}:${messageId.toString()}`
	}

	/**
	 * Запоминает время правки.
	 *
	 * PX, а не EXPIREAT: отсчёт идёт от самой правки, поэтому повторная правка
	 * просто перезаписывает значение и продлевает жизнь ключа.
	 */
	async set(messageId: bigint, editedAt: number): Promise<void> {
		try {
			await this.redis.set(this.key(messageId), editedAt.toString(), 'PX', RETENTION_MS)
		} catch {
			/*
			 * Недоступный Redis не должен ломать саму правку: текст уже сохранён,
			 * флаг isEdited проставлен, потеряется только точное время.
			 */
		}
	}

	/**
	 * Время правки для пачки сообщений.
	 *
	 * Один pipeline на всю страницу истории: иначе пятьдесят сообщений превратились
	 * бы в пятьдесят отдельных обращений к Redis.
	 */
	async get(messageIds: bigint[]): Promise<Map<string, number>> {
		const result = new Map<string, number>()

		if (messageIds.length === 0) return result

		const pipeline = this.redis.pipeline()

		for (const messageId of messageIds) {
			pipeline.get(this.key(messageId))
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

			const raw = response[1] as string | null
			if (!raw) return

			const editedAt = Number(raw)
			if (Number.isFinite(editedAt)) result.set(messageId.toString(), editedAt)
		})

		return result
	}

	/** Сообщение удалено — время его правки больше не нужно. */
	async remove(messageIds: bigint[]): Promise<void> {
		if (messageIds.length === 0) return

		try {
			await this.redis.del(...messageIds.map((messageId) => this.key(messageId)))
		} catch {}
	}
}

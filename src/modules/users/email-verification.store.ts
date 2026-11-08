import { Inject, Injectable } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../providers/redis/redis.module'

/** Длина кода подтверждения, который уходит на почту. */
const CODE_LENGTH = 6

/** Время жизни кода: раньше срок лежал в поле expiresAt, теперь это TTL ключа. */
const CODE_TTL_SECONDS = 10 * 60

const KEY_PREFIX = 'email-verification'

const MAX_VERIFY_ATTEMPTS = 5

const ATTEMPTS_TTL_SECONDS = CODE_TTL_SECONDS

interface PendingEmail {
	email: string
	code: string
}

/*
 * Хранилище кодов подтверждения почты и сброса пароля.
 *
 * Коды лежат в Redis, а не в памяти процесса: Map терялась при каждом рестарте
 * и не работала больше чем на одном инстансе — код, выданный одним процессом,
 * не находился в другом. TTL ключа снимает и необходимость чистить просрочку
 * вручную.
 */
@Injectable()
export class EmailVerificationStore {
	constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

	private key(userId: bigint): string {
		return `${KEY_PREFIX}:${userId.toString()}`
	}

	private attemptsKey(userId: bigint): string {
		return `${KEY_PREFIX}-attempts:${userId.toString()}`
	}

	/**
	 * Генерирует шестизначный код.
	 *
	 * Источник случайности — crypto.randomInt (CSPRNG), а не Math.random:
	 * состояние Math.random восстанавливается по нескольким выданным значениям,
	 * то есть код сброса пароля можно было предсказать, запросив несколько своих.
	 * randomInt даёт равномерное распределение без смещения по модулю, а
	 * padStart сохраняет ровно шесть знаков, включая коды с ведущими нулями.
	 */
	async generateCode(userId: bigint, email: string): Promise<string> {
		const code = randomInt(0, 10 ** CODE_LENGTH)
			.toString()
			.padStart(CODE_LENGTH, '0')

		const pending: PendingEmail = { email, code }

		await this.redis.set(this.key(userId), JSON.stringify(pending), 'EX', CODE_TTL_SECONDS)
		await this.redis.del(this.attemptsKey(userId))

		return code
	}

	async validate(userId: bigint, code: string): Promise<{ valid: boolean; email?: string }> {
		const raw = await this.redis.get(this.key(userId))
		if (!raw) return { valid: false }

		const pending = JSON.parse(raw) as PendingEmail

		const attempts = await this.redis.incr(this.attemptsKey(userId))
		if (attempts === 1) {
			await this.redis.expire(this.attemptsKey(userId), ATTEMPTS_TTL_SECONDS)
		}

		if (attempts > MAX_VERIFY_ATTEMPTS) {
			await this.delete(userId)
			return { valid: false }
		}

		const valid = pending.code === code
		const email = valid ? pending.email : undefined

		return { valid, email }
	}

	async consume(userId: bigint, code: string): Promise<{ valid: boolean; email?: string }> {
		const result = await this.validate(userId, code)
		if (result.valid) {
			await this.delete(userId)
		}
		return result
	}

	async verify(userId: bigint, code: string): Promise<{ valid: boolean; email?: string }> {
		return this.consume(userId, code)
	}

	async delete(userId: bigint): Promise<void> {
		await this.redis.del(this.key(userId))
		await this.redis.del(this.attemptsKey(userId))
	}
}

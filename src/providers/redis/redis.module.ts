import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

/** Токен внедрения клиента Redis. */
export const REDIS_CLIENT = 'REDIS_CLIENT'

/*
 * Общий клиент Redis на всё приложение.
 *
 * Модуль глобальный: клиент нужен разным модулям, но соединение должно быть
 * одно — ioredis держит собственный пул и переподключение внутри себя.
 */
@Global()
@Module({
	providers: [
		{
			provide: REDIS_CLIENT,
			inject: [ConfigService],
			useFactory: (config: ConfigService): Redis =>
				new Redis(config.get<string>('REDIS_URL')!, {
					maxRetriesPerRequest: 3
				})
		}
	],
	exports: [REDIS_CLIENT]
})
export class RedisModule implements OnModuleDestroy {
	constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

	/** Закрывает соединение при остановке приложения, чтобы процесс не висел. */
	async onModuleDestroy(): Promise<void> {
		await this.redis.quit()
	}
}

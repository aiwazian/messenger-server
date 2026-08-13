import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'

/*
 * lastSeen писался в Postgres на каждое подключение и отключение сокета, то есть
 * на каждый чих мобильной сети. Для смысла поля (показать время последнего
 * визита и вычистить мёртвые сессии) точности в полминуты более чем достаточно.
 */
const MIN_WRITE_INTERVAL_MS = 30_000
const MAX_TRACKED_SESSIONS = 10_000

@Injectable()
export class SessionActivityService {
	private readonly logger = new Logger(SessionActivityService.name)
	private readonly lastWrites = new Map<number, number>()

	constructor(private readonly prisma: PrismaService) {}

	async touch(sessionId: number): Promise<void> {
		const now = Date.now()
		const writtenAt = this.lastWrites.get(sessionId)
		if (writtenAt && now - writtenAt < MIN_WRITE_INTERVAL_MS) return

		this.lastWrites.set(sessionId, now)
		this.prune(now)

		try {
			await this.prisma.session.update({
				where: { id: sessionId },
				data: { lastSeen: BigInt(now) }
			})
		} catch (error: any) {
			/* Отметку снимаем, чтобы следующая попытка не ждала полминуты. */
			this.lastWrites.delete(sessionId)
			this.logger.warn(`Failed to update session lastSeen: ${error.message}`)
		}
	}

	private prune(now: number): void {
		if (this.lastWrites.size <= MAX_TRACKED_SESSIONS) return

		for (const [sessionId, writtenAt] of this.lastWrites) {
			if (now - writtenAt > MIN_WRITE_INTERVAL_MS * 10) this.lastWrites.delete(sessionId)
		}
	}
}

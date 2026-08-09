import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CreateSessionDto } from './dto/create-session.dto'
import { plainToInstance } from 'class-transformer'
import { SessionResponseDto } from './dto/session-response.dto'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { SessionId } from '../../common/types/session-id.type'
import {
	generateSessionToken,
	hashSessionToken,
	isSessionTokenFormat
} from '../../common/utils/token.util'

/**
 * Через столько дней без активности сессия удаляется.
 *
 * Бессрочный токен сам не истекает, поэтому забытая сессия иначе остаётся
 * рабочей навсегда, а таблица растёт без предела. Год отсчитывается от
 * последнего подключения, поэтому живых пользователей это не касается.
 */
const SESSION_INACTIVITY_LIMIT_DAYS = 365

@Injectable()
export class SessionsService {
	private readonly logger = new Logger(SessionsService.name)

	constructor(
		private readonly prisma: PrismaService,
		@Inject(forwardRef(() => RealtimeGateway))
		private readonly realtimeGateway: RealtimeGateway
	) {}

	async getAll(userId: UserId, currentToken?: string): Promise<SessionResponseDto[]> {
		const currentTokenHash = currentToken ? hashSessionToken(currentToken) : undefined

		const sessions = await this.prisma.session.findMany({
			where: {
				userId: userId
			}
		})

		return sessions.map((session) => {
			const dto = plainToInstance(SessionResponseDto, session)
			if (currentTokenHash && session.tokenHash === currentTokenHash) {
				dto.isCurrent = true
			}
			return dto
		})
	}

	/**
	 * Проверка токена целиком: совпал хэш с живой сессией — токен действителен.
	 *
	 * Формат проверяется до запроса, чтобы мусор и токены прежнего формата не
	 * доходили до базы.
	 */
	async findByToken(token: string): Promise<SessionResponseDto | null> {
		if (!isSessionTokenFormat(token)) {
			return null
		}

		const session = await this.prisma.session.findUnique({
			where: { tokenHash: hashSessionToken(token) }
		})

		if (!session) {
			return null
		}

		return plainToInstance(SessionResponseDto, session)
	}

	/**
	 * Создаёт сессию и возвращает токен вместе с ней.
	 *
	 * Токен генерируется здесь и в открытом виде существует ровно один раз — в
	 * ответе на вход. В базу уходит только хэш, поэтому показать пользователю
	 * токен ещё раз невозможно.
	 */
	async create(dto: CreateSessionDto): Promise<{ session: SessionResponseDto; token: string }> {
		const token = generateSessionToken()

		const session = await this.prisma.session.create({
			data: {
				userId: dto.userId,
				tokenHash: hashSessionToken(token),
				deviceModel: dto.deviceModel,
				osName: dto.osName,
				osVersion: dto.osVersion,
				createdAt: Date.now()
			}
		})

		return { session: plainToInstance(SessionResponseDto, session), token: token }
	}

	async deleteById(id: number): Promise<void> {
		const session = await this.prisma.session.findUnique({
			where: { id }
		})

		if (!session) {
			throw new NotFoundException(`Session not found`)
		}

		await this.prisma.session.delete({ where: { id: id } })
		await this.realtimeGateway.kickSession(session.id)
	}

	/**
	 * Привязывает Firebase Installation ID к сессии: в новом API FCM адресатом
	 * уведомления является именно он.
	 *
	 * FID один на устройство, а уведомления должен получать только активный аккаунт,
	 * поэтому FID живёт ровно в одной сессии: при переключении аккаунта клиент
	 * присылает его заново, и у остальных сессий того же устройства он снимается.
	 * Оба запроса идут одной транзакцией, иначе между ними возможно состояние,
	 * в котором устройство не получает уведомлений вовсе.
	 */
	async updateInstallationId(token: string, installationId: string): Promise<void> {
		const session = await this.findByToken(token)

		if (!session) {
			throw new NotFoundException(`Session not found`)
		}

		await this.prisma.$transaction([
			this.prisma.session.updateMany({
				where: { installationId, NOT: { id: session.id } },
				data: { installationId: null }
			}),
			this.prisma.session.update({
				where: { id: session.id },
				data: { installationId }
			})
		])
	}

	async deleteByToken(token: string): Promise<void> {
		const session = await this.findByToken(token)

		if (!session) {
			throw new NotFoundException(`Session not found`)
		}

		await this.prisma.session.delete({ where: { id: session.id } })
		await this.realtimeGateway.kickSession(session.id)
	}

	async deleteAll(userId: UserId, excludeToken?: string): Promise<void> {
		const current = excludeToken ? await this.findByToken(excludeToken) : null

		await this.prisma.session.deleteMany({
			where: {
				userId: userId,
				NOT: current ? { id: current.id } : undefined
			}
		})

		if (current) {
			await this.realtimeGateway.kickUserExceptSession(userId, current.id)
		} else {
			this.realtimeGateway.kickUser(userId)
		}
	}

	async isOwner(sessionId: SessionId, userId: UserId): Promise<boolean> {
		const count = await this.prisma.session.count({
			where: { id: sessionId, userId: userId }
		})

		return count > 0
	}

	/**
	 * Убирает сессии, которых давно не видно.
	 *
	 * lastSeen обновляется на каждом подключении сокета; у сессий, ни разу не
	 * подключавшихся, вместо него берётся дата создания.
	 */
	@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
	async deleteInactiveSessions() {
		const cutoff = BigInt(Date.now() - SESSION_INACTIVITY_LIMIT_DAYS * 24 * 60 * 60 * 1000)

		const { count } = await this.prisma.session.deleteMany({
			where: {
				OR: [{ lastSeen: { lt: cutoff } }, { lastSeen: null, createdAt: { lt: cutoff } }]
			}
		})

		if (count > 0) {
			this.logger.log(`Deleted ${count} inactive sessions`)
		}
	}
}

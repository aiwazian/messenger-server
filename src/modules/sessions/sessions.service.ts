import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { CreateSessionDto } from './dto/create-session.dto'
import { plainToInstance } from 'class-transformer'
import { SessionResponseDto } from './dto/session-response.dto'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { SessionId } from '../../common/types/session-id.type'

@Injectable()
export class SessionsService {
	constructor(
		private readonly prisma: PrismaService,
		@Inject(forwardRef(() => RealtimeGateway))
		private readonly realtimeGateway: RealtimeGateway
	) { }

	async getAll(userId: UserId, currentToken?: string): Promise<SessionResponseDto[]> {
		const sessions = await this.prisma.session.findMany({
			where: {
				userId: userId
			}
		})
		return sessions.map((session) => {
			const dto = plainToInstance(SessionResponseDto, session)
			if (currentToken && session.token === currentToken) {
				dto.isCurrent = true
			}
			return dto
		})
	}

	async findByToken(token: string): Promise<SessionResponseDto> {
		const session = await this.prisma.session.findFirst({
			where: { token: token }
		})
		return plainToInstance(SessionResponseDto, session)
	}

	async findByTokenAndUserId(token: string, id: UserId): Promise<SessionResponseDto> {
		const session = await this.prisma.session.findFirst({
			where: { token: token, userId: id }
		})
		return plainToInstance(SessionResponseDto, session)
	}

	async create(dto: CreateSessionDto): Promise<SessionResponseDto> {
		const session = await this.prisma.session.create({
			data: {
				userId: dto.userId,
				token: dto.token,
				fcmToken: dto.fcmToken,
				deviceModel: dto.deviceModel,
				osName: dto.osName,
				osVersion: dto.osVersion,
				createdAt: Date.now()
			}
		})
		return plainToInstance(SessionResponseDto, session)
	}

	async deleteById(id: number): Promise<void> {
		const session = await this.prisma.session.findUnique({
			where: { id }
		})

		if (!session) {
			throw new NotFoundException(`Session not found`)
		}

		const token = session.token
		await this.prisma.session.delete({ where: { id: id } })
		await this.realtimeGateway.kickUserByToken(token)
	}

	async updateFcmToken(token: string, fcmToken: string): Promise<void> {
		const session = await this.prisma.session.findUnique({
			where: { token }
		})

		if (!session) {
			throw new NotFoundException(`Session not found`)
		}

		await this.prisma.session.update({
			where: { token },
			data: { fcmToken }
		})
	}

	async deleteByToken(token: string): Promise<void> {
		const session = await this.prisma.session.findUnique({
			where: { token }
		})

		if (!session) {
			throw new NotFoundException(`Session not found`)
		}

		await this.prisma.session.delete({ where: { token } })
		await this.realtimeGateway.kickUserByToken(token)
	}

	async deleteAll(userId: UserId, excludeToken?: string): Promise<void> {
		await this.prisma.session.deleteMany({
			where: {
				userId: userId,
				NOT: excludeToken ? { token: excludeToken } : undefined
			}
		})

		if (excludeToken) {
			// Kick only others? Or excludeToken is the current one?
			// Usually deleteAll means logout from other devices.
			const userSockets = await (this.realtimeGateway.server as any).fetchSockets()
			for (const s of userSockets) {
				if (s.data.userId === userId && s.data.token !== excludeToken) {
					s.emit('auth:error')
					s.disconnect(true)
				}
			}
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
}

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

@Injectable()
export class SessionAgeGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest()
		const session: { createdAt?: string | number | bigint } = request.user?.session

		if (!session?.createdAt) {
			throw new ForbiddenException('Session not found')
		}

		const sessionCreatedAt = BigInt(session.createdAt)
		const now = BigInt(Date.now())

		if (now - sessionCreatedAt < BigInt(TWENTY_FOUR_HOURS_MS)) {
			throw new ForbiddenException(
				'Смена пароля учётной записи будет доступна через 24 часа с начала текущей сессии'
			)
		}

		return true
	}
}

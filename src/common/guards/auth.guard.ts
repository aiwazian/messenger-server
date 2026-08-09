import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SessionsService } from '../../modules/sessions/sessions.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { UserId } from '../types/user-id.type'

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly sessionService: SessionsService
	) {}

	async canActivate(context: ExecutionContext) {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass()
		])
		if (isPublic) return true

		const request = context.switchToHttp().getRequest()
		let token = request.token

		if (!token) {
			const authHeader = request.headers['authorization'] || request.headers['Authorization']

			if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
				throw new UnauthorizedException('Authorization header is missing or invalid')
			}

			token = authHeader.slice(7).trim()

			if (!token) {
				throw new UnauthorizedException('Token is missing')
			}
		}

		/*
		 * Токен ничего не доказывает сам по себе: единственный источник истины —
		 * таблица сессий. Удалённая на сервере сессия сразу даёт 401, отдельной
		 * проверки срока действия нет — у токена его нет.
		 */
		const session = await this.sessionService.findByToken(token)
		if (!session) {
			throw new UnauthorizedException('Invalid token')
		}

		request.user = { id: UserId(session.userId), token: token, session: session }

		return true
	}
}

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { TokenPayload } from '../types/token-payload.type'
import { Reflector } from '@nestjs/core'
import { JwtAuthService } from '../../modules/security/jwt.service'
import { SessionsService } from '../../modules/sessions/sessions.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly sessionService: SessionsService,
		private readonly jwtService: JwtAuthService
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

		let payload: TokenPayload
		try {
			payload = this.jwtService.verifyToken(token)
		} catch (err) {
			throw new UnauthorizedException('Invalid or expired token')
		}

		const session = await this.sessionService.findByTokenAndUserId(token, payload.userId)
		if (!session) {
			throw new UnauthorizedException('Invalid token')
		}

		request.user = { id: payload.userId, token: token, session: session }

		return true
	}
}

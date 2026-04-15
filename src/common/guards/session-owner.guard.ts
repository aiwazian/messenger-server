import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { PARAMS } from '../constants/param.constants'
import { SessionId } from '../types/session-id.type'
import { SessionsService } from '../../modules/sessions/sessions.service'

@Injectable()
export class SessionOwnerGuard implements CanActivate {
	constructor(private readonly sessionsService: SessionsService) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const sessionId: SessionId = SessionId(request.params[PARAMS.SESSION_ID])

		const isOwner = await this.sessionsService.isOwner(sessionId, user.id)
		if (!isOwner) {
			throw new ForbiddenException('You are not allowed to delete this session')
		}

		return true
	}
}

import { Controller, Delete, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common'
import { SessionsService } from './sessions.service'
import { AuthGuard } from '../../common/guards/auth.guard'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { CurrentUserToken } from '../../common/decorators/user-token.decorator'
import { PARAMS } from '../../common/constants/param.constants'
import { SessionOwnerGuard } from '../../common/guards/session-owner.guard'

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
	constructor(private readonly sessionsService: SessionsService) { }

	@Get()
	getAll(@CurrentUserId() userId: UserId, @CurrentUserToken() token: string) {
		return this.sessionsService.getAll(userId, token)
	}

	@Delete(`:${PARAMS.SESSION_ID}`)
	@UseGuards(SessionOwnerGuard)
	delete(@Param(PARAMS.SESSION_ID, ParseIntPipe) id: number) {
		return this.sessionsService.deleteById(id)
	}

	@Delete()
	deleteAll(@CurrentUserId() userId: UserId, @CurrentUserToken() token: string) {
		return this.sessionsService.deleteAll(userId, token)
	}
}

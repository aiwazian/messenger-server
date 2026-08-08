import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Patch,
	UseGuards
} from '@nestjs/common'
import { SessionsService } from './sessions.service'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { CurrentUserToken } from '../../common/decorators/user-token.decorator'
import { PARAMS } from '../../common/constants/param.constants'
import { SessionOwnerGuard } from '../../common/guards/session-owner.guard'
import { SessionAgeGuard } from '../../common/guards/session-age.guard'
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto'
import { UpdateInstallationIdDto } from './dto/update-installation-id.dto'

@Controller('sessions')
export class SessionsController {
	constructor(private readonly sessionsService: SessionsService) {}

	@Get()
	getAll(@CurrentUserId() userId: UserId, @CurrentUserToken() token: string) {
		return this.sessionsService.getAll(userId, token)
	}

	@Patch('installation-id')
	updateInstallationId(@CurrentUserToken() token: string, @Body() dto: UpdateInstallationIdDto) {
		return this.sessionsService.updateInstallationId(token, dto.installationId)
	}

	/**
	 * Устаревший эндпоинт для клиентов, которые ещё присылают registration token.
	 * Убрать после того, как версии до 1.19.0 перестанут ходить в API.
	 */
	@Patch('fcm-token')
	updateFcmToken(@CurrentUserToken() token: string, @Body() dto: UpdateFcmTokenDto) {
		return this.sessionsService.updateFcmToken(token, dto.fcmToken)
	}

	@Delete(`:${PARAMS.SESSION_ID}`)
	@UseGuards(SessionOwnerGuard, SessionAgeGuard)
	delete(@Param(PARAMS.SESSION_ID, ParseIntPipe) id: number) {
		return this.sessionsService.deleteById(id)
	}

	@Delete()
	@UseGuards(SessionAgeGuard)
	deleteAll(@CurrentUserId() userId: UserId, @CurrentUserToken() token: string) {
		return this.sessionsService.deleteAll(userId, token)
	}
}

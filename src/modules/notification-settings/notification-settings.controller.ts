import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common'
import { NotificationSettingsService } from './notification-settings.service'
import { NotificationSettingsDto } from './dto/notification-settings.dto'
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'

@Controller('users/me/notifications')
export class NotificationSettingsController {
	constructor(private readonly notificationSettings: NotificationSettingsService) {}

	@Get()
	get(@CurrentUserId() userId: UserId): Promise<NotificationSettingsDto> {
		return this.notificationSettings.get(userId)
	}

	@Patch()
	@HttpCode(HttpStatus.OK)
	update(
		@CurrentUserId() userId: UserId,
		@Body() dto: UpdateNotificationSettingsDto
	): Promise<NotificationSettingsDto> {
		return this.notificationSettings.update(userId, dto)
	}
}

import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Patch,
	Put,
	Query
} from '@nestjs/common'
import { NotificationSettingsService } from './notification-settings.service'
import { NotificationSettingsDto } from './dto/notification-settings.dto'
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto'
import { ChatNotificationSettingDto } from './dto/chat-notification-setting.dto'
import { UpdateChatNotificationSettingDto } from './dto/update-chat-notification-setting.dto'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'

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

	/**
	 * Все исключения пользователя: чаты с настройкой, отличной от их категории.
	 *
	 * Задел под отдельный экран исключений: список приходит целиком, потому что
	 * строк ровно столько, сколько чатов пользователь тронул руками.
	 */
	@Get('chats')
	getChats(@CurrentUserId() userId: UserId): Promise<ChatNotificationSettingDto[]> {
		return this.notificationSettings.getChatSettings(userId)
	}

	/**
	 * Убрать исключения разом.
	 *
	 * category сужает удаление до одной категории: экран исключений открыт для
	 * своей категории, и его кнопка «Удалить все» не должна трогать чужие. Без
	 * параметра снимаются все исключения пользователя.
	 */
	@Delete('chats')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteAllChats(
		@CurrentUserId() userId: UserId,
		@Query('category') category?: string
	): Promise<void> {
		return this.notificationSettings.deleteAllChatSettings(userId, category)
	}

	/** Добавить чат в исключения или изменить уже существующее. */
	@Put('chats/:chatId')
	@HttpCode(HttpStatus.OK)
	setChat(
		@CurrentUserId() userId: UserId,
		@Param('chatId') chatId: string,
		@Body() dto: UpdateChatNotificationSettingDto
	): Promise<ChatNotificationSettingDto> {
		return this.notificationSettings.setChatSetting(userId, ChatId(chatId), dto.enabled)
	}

	/** Убрать чат из исключений: он снова следует настройке своей категории. */
	@Delete('chats/:chatId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteChat(@CurrentUserId() userId: UserId, @Param('chatId') chatId: string): Promise<void> {
		return this.notificationSettings.deleteChatSetting(userId, ChatId(chatId))
	}
}

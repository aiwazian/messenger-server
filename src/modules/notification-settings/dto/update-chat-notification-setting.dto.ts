import { IsBoolean } from 'class-validator'

/**
 * Переключение уведомлений для одного чата.
 *
 * Приходит нужное значение, а не «переключи»: два устройства, нажавшие кнопку
 * одновременно, вернули бы чат в исходное состояние.
 */
export class UpdateChatNotificationSettingDto {
	@IsBoolean()
	enabled: boolean
}

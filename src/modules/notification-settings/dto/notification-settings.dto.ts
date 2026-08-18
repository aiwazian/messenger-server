import { Exclude, Expose } from 'class-transformer'

/**
 * Категории чатов, от которых пользователь хочет получать уведомления.
 *
 * Всегда отдаётся целиком, а не частично: клиент хранит настройки одной
 * строкой в Room и перезаписывает её ответом сервера.
 */
@Exclude()
export class NotificationSettingsDto {
	@Expose()
	privateChats: boolean

	@Expose()
	groups: boolean

	@Expose()
	channels: boolean
}

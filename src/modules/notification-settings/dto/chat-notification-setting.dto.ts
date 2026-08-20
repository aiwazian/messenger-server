import { Exclude, Expose } from 'class-transformer'

/**
 * Уведомления по одному чату: строка будущего экрана исключений.
 *
 * Отдаётся и «принудительно включён», и «принудительно выключен»: экран должен
 * показывать оба списка, а по одному лишь chatId их не различить.
 */
@Exclude()
export class ChatNotificationSettingDto {
	@Expose()
	chatId: string

	@Expose()
	enabled: boolean
}

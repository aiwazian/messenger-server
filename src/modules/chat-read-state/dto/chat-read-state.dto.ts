import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

/** Состояние прочтения одного чата: бейдж в списке чатов и точка открытия истории. */
@Exclude()
export class ChatReadStateDto {
	@Expose()
	chatId: string

	@Expose()
	unreadCount: number

	@Expose()
	@OmitNull()
	lastReadMessageId?: string

	/** Первое непрочитанное сообщение: клиент открывает чат на нём. */
	@Expose()
	@OmitNull()
	firstUnreadMessageId?: string

	/**
	 * Пользователь пометил чат непрочитанным вручную.
	 *
	 * unreadCount при этом обычно 0: клиент рисует пустой бейдж вместо числа.
	 */
	@Expose()
	isManuallyUnread: boolean
}

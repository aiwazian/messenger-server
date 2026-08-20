import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'
import { MessageResponseDto } from '../../messages/dto/message-response.dto'

@Exclude()
export class ChatResponseDto {
	@Expose()
	id: number

	@Expose()
	name: string

	@Expose()
	isPinned: boolean

	@Expose()
	@OmitNull()
	lastMessage?: MessageResponseDto

	/** Сколько сообщений пользователь не прочитал: бейдж справа в ChatCard. */
	@Expose()
	unreadCount: number

	/** С какого сообщения открывать чат. */
	@Expose()
	@OmitNull()
	firstUnreadMessageId?: string

	/** Чат помечен непрочитанным вручную: бейдж рисуется пустым. */
	@Expose()
	isManuallyUnread: boolean

	/**
	 * Уведомления по чату молчат: перечёркнутый колокольчик рядом с названием.
	 *
	 * Это итоговое состояние, а не наличие исключения: чат без своей настройки берёт
	 * значение из категории, поэтому выключенная категория «Каналы» гасит колокольчики
	 * во всех каналах сразу, а исключение по чату перебивает её в любую сторону.
	 */
	@Expose()
	isMuted: boolean
}

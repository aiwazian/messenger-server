import { Exclude, Expose, Type } from 'class-transformer'
import { MessageResponseDto } from './message-response.dto'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class MessagesWindowResponseDto {
	/** Непрерывный отрезок истории, отсортированный от старых к новым. */
	@Expose()
	@Type(() => MessageResponseDto)
	messages: MessageResponseDto[]

	/** Есть ли ещё сообщения старше messages[0]. */
	@Expose()
	hasMoreBefore: boolean

	/** Есть ли ещё сообщения новее последнего элемента. */
	@Expose()
	hasMoreAfter: boolean

	/** Сколько непрочитанных в чате на момент загрузки окна. */
	@Expose()
	unreadCount: number

	/** Первое непрочитанное: клиент ставит на него разделитель и прокрутку. */
	@Expose()
	@OmitNull()
	firstUnreadMessageId?: string
}

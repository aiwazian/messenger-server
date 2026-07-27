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
}

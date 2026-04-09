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
	isPinned: string

	@Expose()
	@OmitNull()
	lastMessage?: MessageResponseDto
}

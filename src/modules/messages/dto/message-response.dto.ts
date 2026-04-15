import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class MessageFileDto {
	@Expose()
	id: string

	@Expose()
	name: string

	@Expose()
	size: string

	@Expose()
	mimeType: string

	@Expose()
	status: string
}

@Exclude()
export class MessageResponseDto {
	@Expose()
	id: number

	@Expose()
	senderId: number

	@Expose()
	chatId: string

	@Expose()
	text: string

	@Expose()
	sendTime: number

	@Expose()
	@OmitNull()
	editedAt?: number

	@Expose()
	@OmitNull()
	isRead?: boolean

	@Expose()
	files: MessageFileDto[]
}

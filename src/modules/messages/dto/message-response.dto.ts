import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'
import { MessageType } from '../../../../generated/prisma/enums'

@Exclude()
export class MessageAttachmentDto {
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

	@Expose()
	type: string
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
	@OmitNull()
	text?: string

	@Expose()
	sendTime: number

	@Expose()
	@OmitNull()
	editedAt?: number

	@Expose()
	@OmitNull()
	isRead?: boolean

	@Expose()
	attachments: MessageAttachmentDto[]

	@Expose()
	messageType: MessageType

	@Expose()
	@OmitNull()
	systemEventType?: string
}

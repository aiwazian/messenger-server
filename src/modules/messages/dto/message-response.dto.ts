import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'
import { AttachmentType, MessageType } from '../../../generated/prisma/enums'

@Exclude()
export class MessageAttachmentDto {
	@Expose()
	fileId: string

	@Expose()
	name: string

	@Expose()
	size: number

	@Expose()
	mimeType: string

	@Expose()
	status: string

	@Expose()
	type: AttachmentType
}

@Exclude()
export class MessageReadInfoDto {
	@Expose()
	userId: number

	@Expose()
	firstName: string

	@Expose()
	lastName?: string

	@Expose()
	readAt: number
}

@Exclude()
export class MessageResponseDto {
	@Expose()
	id: number

	@Expose()
	senderId: number

	@Expose()
	chatId: number

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
	messageType: MessageType

	@Expose()
	@OmitNull()
	attachments: MessageAttachmentDto[]

	@Expose()
	@OmitNull()
	systemEventType?: string

	@Expose()
	@OmitNull()
	readInfo?: MessageReadInfoDto[]
}

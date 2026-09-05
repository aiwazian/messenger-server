import { Exclude, Expose, Transform, Type } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'
import { AttachmentType, MessageType } from '../../../generated/prisma/enums'
import { ForwardSourceAccess } from '../../../common/enums/forward-source-access.enum'

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

	@Expose()
	@OmitNull()
	width?: number

	@Expose()
	@OmitNull()
	height?: number
}

@Exclude()
export class MessageStickerDto {
	@Expose()
	@Transform(({ value }) => value?.toString())
	id: string

	@Expose()
	@Transform(({ value }) => value?.toString())
	packId: string

	@Expose()
	fileId: string

	@Expose()
	emojis: string[]
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
export class MessageReplyPreviewDto {
	@Expose()
	id: number

	@Expose()
	senderId: number

	@Expose()
	@OmitNull()
	chatId?: number

	@Expose()
	@OmitNull()
	text?: string

	@Expose()
	messageType: MessageType

	@Expose()
	@OmitNull()
	senderName?: string

	@Expose()
	@OmitNull()
	chatName?: string

	@Expose()
	@OmitNull()
	attachmentTypes?: AttachmentType[]
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
	isEdited?: boolean

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
	@Type(() => MessageStickerDto)
	sticker?: MessageStickerDto

	@Expose()
	@OmitNull()
	systemEventType?: string

	@Expose()
	@OmitNull()
	readInfo?: MessageReadInfoDto[]

	@Expose()
	@OmitNull()
	replyToId?: number

	@Expose()
	@OmitNull()
	replyToChatId?: number

	@Expose()
	@OmitNull()
	forwardedFromChatId?: number

	@Expose()
	@OmitNull()
	forwardedFromName?: string

	@Expose()
	@OmitNull()
	forwardedFromAccess?: ForwardSourceAccess

	@Expose()
	@OmitNull()
	@Type(() => MessageReplyPreviewDto)
	replyTo?: MessageReplyPreviewDto
}

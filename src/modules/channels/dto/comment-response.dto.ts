import { Exclude, Expose, Transform, Type } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'
import { CommentAuthorRole } from '../../../common/enums/comment-author-role.enum'
import { MessageAttachmentDto, MessageStickerDto } from '../../messages/dto/message-response.dto'
import { MessageType } from '../../../generated/prisma/enums'

@Exclude()
export class CommentAuthorDto {
	@Expose()
	id: number

	@Expose()
	firstName: string

	@Expose()
	@OmitNull()
	lastName?: string
}

@Exclude()
export class CommentReplyPreviewDto {
	@Expose()
	id: number

	@Expose()
	senderId: number

	@Expose()
	messageType: MessageType

	@Expose()
	@OmitNull()
	text?: string

	@Expose()
	@OmitNull()
	senderName?: string

	@Expose()
	@OmitNull()
	@Transform(({ obj }) => obj?.sticker?.emojis?.[0])
	stickerEmoji?: string
}

@Exclude()
export class CommentResponseDto {
	@Expose()
	id: number

	@Expose()
	postId: number

	@Expose()
	senderId: number

	@Expose()
	messageType: MessageType

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
	senderRole: CommentAuthorRole

	@Expose()
	@OmitNull()
	@Type(() => MessageStickerDto)
	sticker?: MessageStickerDto

	@Expose()
	@OmitNull()
	attachments: MessageAttachmentDto[]

	@Expose()
	@OmitNull()
	@Type(() => CommentReplyPreviewDto)
	replyTo?: CommentReplyPreviewDto

	@Expose()
	@Type(() => CommentAuthorDto)
	sender: CommentAuthorDto
}

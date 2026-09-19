import { Exclude, Expose, Type } from 'class-transformer'
import { AttachmentType } from '../../../generated/prisma/enums'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class ChatMediaItemDto {
	@Expose()
	id: number

	@Expose()
	fileId: string

	@Expose()
	messageId: number

	@Expose()
	senderId: number

	@Expose()
	name: string

	@Expose()
	size: number

	@Expose()
	mimeType: string

	@Expose()
	type: AttachmentType

	@Expose()
	sendTime: number

	@Expose()
	@OmitNull()
	width?: number

	@Expose()
	@OmitNull()
	height?: number
}

@Exclude()
export class ChatMediaResponseDto {
	@Expose()
	@Type(() => ChatMediaItemDto)
	items: ChatMediaItemDto[]

	@Expose()
	@OmitNull()
	nextCursorId?: number
}

@Exclude()
export class ChatMediaCountsResponseDto {
	@Expose()
	photos: number

	@Expose()
	videos: number

	@Expose()
	files: number

	@Expose()
	music: number

	@Expose()
	voices: number
}

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
	spoiler: boolean

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

	@Expose()
	contacts: number
}

@Exclude()
export class ChatContactDto {
	@Expose()
	contactId: number

	@Expose()
	messageId: number

	@Expose()
	senderId: number

	@Expose()
	sendTime: number

	@Expose()
	name: string

	@Expose()
	phones: string[]

	@Expose()
	emails: string[]

	@Expose()
	urls: string[]

	@Expose()
	addresses: string[]

	@Expose()
	@OmitNull()
	organization?: string

	@Expose()
	@OmitNull()
	jobTitle?: string

	@Expose()
	@OmitNull()
	birthday?: string
}

@Exclude()
export class ChatContactsResponseDto {
	@Expose()
	@Type(() => ChatContactDto)
	items: ChatContactDto[]

	@Expose()
	@OmitNull()
	nextCursorId?: number
}

import { Expose, Transform } from 'class-transformer'

export enum SearchResultType {
	CHAT = 'chat',
	FILE = 'file'
}

export class SearchResponseDto {
	@Expose()
	type: SearchResultType

	@Expose()
	@Transform(({ value }) => value?.toString())
	chatId: string

	@Expose()
	name: string

	@Expose()
	@Transform(({ value }) => value?.toString())
	fileId?: string

	@Expose()
	size?: string

	@Expose()
	mimeType?: string

	@Expose()
	@Transform(({ value }) => value?.toString())
	messageId?: string

	@Expose()
	senderName?: string

	@Expose()
	createdAt?: string
}

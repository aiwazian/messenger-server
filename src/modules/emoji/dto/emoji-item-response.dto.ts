import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class EmojiItemResponseDto {
	@Expose()
	id: string

	@Expose()
	packId: string

	@Expose()
	fileId: string

	@Expose()
	url: string

	@Expose()
	emojis: string[]

	@Expose()
	sortOrder: number
}

import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class StickerResponseDto {
	@Expose()
	id: string

	@Expose()
	fileId: string

	@Expose()
	url: string

	@Expose()
	emojis: string[]

	@Expose()
	sortOrder: number
}

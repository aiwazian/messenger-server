import { Exclude, Expose, Type } from 'class-transformer'
import { StickerResponseDto } from './sticker-response.dto'

@Exclude()
export class StickerPackResponseDto {
	@Expose()
	id: string

	@Expose()
	name: string

	@Expose()
	username: string

	@Expose()
	ownerId: string

	@Expose()
	coverFileId?: string

	@Expose()
	coverUrl?: string

	@Expose()
	stickerCount: number

	@Expose()
	isOwned: boolean

	@Expose()
	isInstalled: boolean

	@Expose()
	@Type(() => StickerResponseDto)
	stickers: StickerResponseDto[]
}

import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class StickerPackIdDto {
	@Expose()
	packId: string
}

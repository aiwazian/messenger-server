import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class EmojiPackIdDto {
	@Expose()
	packId: string
}

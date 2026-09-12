import { Exclude, Expose, Type } from 'class-transformer'
import { EmojiResponseDto } from './emoji-response.dto'

@Exclude()
export class EmojiPackResponseDto {
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
	emojiCount: number

	@Expose()
	isOwned: boolean

	@Expose()
	isInstalled: boolean

	@Expose()
	@Type(() => EmojiResponseDto)
	emojis: EmojiResponseDto[]
}

import { Transform } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsString,
	IsUUID,
	Matches
} from 'class-validator'
import {
	normalizeStickerEmojis,
	STICKER_EMOJI_PATTERN
} from './sticker-emoji.util'
import {
	MAX_EMOJIS_PER_STICKER,
	MIN_EMOJIS_PER_STICKER
} from './sticker-pack.constants'

export class StickerInputDto {
	@IsUUID()
	fileId: string

	@Transform(({ value }) => normalizeStickerEmojis(value))
	@IsArray()
	@ArrayMinSize(MIN_EMOJIS_PER_STICKER)
	@ArrayMaxSize(MAX_EMOJIS_PER_STICKER)
	@ArrayUnique()
	@IsString({ each: true })
	@Matches(STICKER_EMOJI_PATTERN, { each: true })
	emojis: string[]
}

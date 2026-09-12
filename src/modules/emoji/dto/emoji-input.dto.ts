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
import { EMOJI_SYMBOL_PATTERN, normalizeEmojiSymbols } from './emoji-symbol.util'
import { MAX_SYMBOLS_PER_EMOJI, MIN_SYMBOLS_PER_EMOJI } from './emoji-pack.constants'

export class EmojiInputDto {
	@IsUUID()
	fileId: string

	@Transform(({ value }) => normalizeEmojiSymbols(value))
	@IsArray()
	@ArrayMinSize(MIN_SYMBOLS_PER_EMOJI)
	@ArrayMaxSize(MAX_SYMBOLS_PER_EMOJI)
	@ArrayUnique()
	@IsString({ each: true })
	@Matches(EMOJI_SYMBOL_PATTERN, { each: true })
	emojis: string[]
}

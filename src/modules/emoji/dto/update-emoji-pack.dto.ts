import { Transform, Type } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
	MinLength,
	ValidateNested
} from 'class-validator'
import { EmojiInputDto } from './emoji-input.dto'
import {
	EMOJI_PACK_USERNAME_PATTERN,
	MAX_EMOJI_PACK_NAME_LENGTH,
	MAX_EMOJI_PACK_USERNAME_LENGTH,
	MAX_EMOJI_PER_PACK,
	MIN_EMOJI_PACK_USERNAME_LENGTH
} from './emoji-pack.constants'

export class UpdateEmojiPackDto {
	@IsOptional()
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	@IsString()
	@MinLength(1)
	@MaxLength(MAX_EMOJI_PACK_NAME_LENGTH)
	name?: string

	@IsOptional()
	@Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
	@IsString()
	@MinLength(MIN_EMOJI_PACK_USERNAME_LENGTH)
	@MaxLength(MAX_EMOJI_PACK_USERNAME_LENGTH)
	@Matches(EMOJI_PACK_USERNAME_PATTERN)
	username?: string

	@IsOptional()
	@IsUUID()
	coverFileId?: string

	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	removeCover?: boolean

	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_EMOJI_PER_PACK)
	@ValidateNested({ each: true })
	@Type(() => EmojiInputDto)
	emojis?: EmojiInputDto[]
}

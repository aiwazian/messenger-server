import { Transform, Type } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsNumberString,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
	MinLength,
	ValidateNested
} from 'class-validator'
import { StickerInputDto } from './sticker-input.dto'
import {
	MAX_STICKERS_PER_PACK,
	MAX_STICKER_PACK_NAME_LENGTH,
	MAX_STICKER_PACK_USERNAME_LENGTH,
	MIN_STICKER_PACK_USERNAME_LENGTH,
	STICKER_PACK_USERNAME_PATTERN
} from './sticker-pack.constants'

export class CreateStickerPackDto {
	@IsOptional()
	@IsNumberString()
	id?: string

	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	@IsString()
	@MinLength(1)
	@MaxLength(MAX_STICKER_PACK_NAME_LENGTH)
	name: string

	@Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
	@IsString()
	@MinLength(MIN_STICKER_PACK_USERNAME_LENGTH)
	@MaxLength(MAX_STICKER_PACK_USERNAME_LENGTH)
	@Matches(STICKER_PACK_USERNAME_PATTERN)
	username: string

	@IsOptional()
	@IsUUID()
	coverFileId?: string

	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_STICKERS_PER_PACK)
	@ValidateNested({ each: true })
	@Type(() => StickerInputDto)
	stickers: StickerInputDto[]
}

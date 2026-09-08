import { Transform, Type } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsString,
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
	/*
	 * Пробелы срезаются до проверки длины, иначе название из одного пробела
	 * прошло бы MinLength(1) и набор получился бы безымянным.
	 */
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	@IsString()
	@MinLength(1)
	@MaxLength(MAX_STICKER_PACK_NAME_LENGTH)
	name: string

	/*
	 * Регистр сразу приводится к нижнему: в базе уникальность регистрозависимая,
	 * так что без этого Cats и cats стали бы двумя разными наборами с одной
	 * и той же на вид ссылкой.
	 */
	@Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
	@IsString()
	@MinLength(MIN_STICKER_PACK_USERNAME_LENGTH)
	@MaxLength(MAX_STICKER_PACK_USERNAME_LENGTH)
	@Matches(STICKER_PACK_USERNAME_PATTERN)
	username: string

	/*
	 * Набор создаётся сразу со стикерами, а не пустым.
	 *
	 * Пустой набор нечего показывать и некуда отправлять: он бы занял имя и
	 * попал в список созданных, если пользователь бросил экран на полпути.
	 */
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_STICKERS_PER_PACK)
	@ValidateNested({ each: true })
	@Type(() => StickerInputDto)
	stickers: StickerInputDto[]
}

import { Transform, Type } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsOptional,
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

/**
 * Изменение существующего набора.
 *
 * Переданные поля меняются, остальные остаются как были: экран редактора
 * сохраняет всё одной кнопкой, но пользователь мог тронуть только название.
 */
export class UpdateStickerPackDto {
	@IsOptional()
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	@IsString()
	@MinLength(1)
	@MaxLength(MAX_STICKER_PACK_NAME_LENGTH)
	name?: string

	@IsOptional()
	@Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
	@IsString()
	@MinLength(MIN_STICKER_PACK_USERNAME_LENGTH)
	@MaxLength(MAX_STICKER_PACK_USERNAME_LENGTH)
	@Matches(STICKER_PACK_USERNAME_PATTERN)
	username?: string

	/*
	 * Состав передаётся целиком, а не добавлением и удалением по одному.
	 *
	 * Клиент и так держит всю сетку на экране, а замена целиком даёт
	 * идемпотентность: повторное нажатие кнопки после обрыва связи не
	 * продублирует стикеры и не собьёт порядок.
	 */
	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_STICKERS_PER_PACK)
	@ValidateNested({ each: true })
	@Type(() => StickerInputDto)
	stickers?: StickerInputDto[]
}

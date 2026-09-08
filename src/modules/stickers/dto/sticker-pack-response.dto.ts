import { Exclude, Expose, Type } from 'class-transformer'
import { StickerResponseDto } from './sticker-response.dto'

@Exclude()
export class StickerPackResponseDto {
	/** BigInt уезжает строкой: в JSON он не влезает в number без потерь. */
	@Expose()
	id: string

	@Expose()
	name: string

	@Expose()
	username: string

	@Expose()
	ownerId: string

	/**
	 * Сколько стикеров в наборе.
	 *
	 * Отдаётся отдельным числом, а не считается по stickers.length: в списках
	 * наборов сами стикеры не нужны и не грузятся.
	 */
	@Expose()
	stickerCount: number

	/** Создатель — текущий пользователь: только ему доступно редактирование. */
	@Expose()
	isOwned: boolean

	/** Набор добавлен текущим пользователем к себе. */
	@Expose()
	isInstalled: boolean

	/**
	 * Стикеры в порядке отображения.
	 *
	 * Пусто в ответах со списками наборов — там сетка не рисуется.
	 */
	@Expose()
	@Type(() => StickerResponseDto)
	stickers: StickerResponseDto[]
}

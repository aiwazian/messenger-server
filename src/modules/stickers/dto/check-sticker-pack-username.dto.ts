import { IsNumberString, IsOptional, IsString } from 'class-validator'

/**
 * Запрос проверки имени набора.
 *
 * Длина и допустимые символы здесь не проверяются осознанно: поле проверяется
 * на каждом введённом символе, и на недонабранное имя ответ должен быть
 * «недоступно», а не ошибка валидации.
 */
export class CheckStickerPackUsernameDto {
	@IsString()
	username: string

	/**
	 * Набор, который редактируется.
	 *
	 * Своё же имя не должно считаться занятым: иначе набор нельзя было бы
	 * сохранить, не меняя имя.
	 */
	@IsOptional()
	@IsNumberString()
	packId?: string
}

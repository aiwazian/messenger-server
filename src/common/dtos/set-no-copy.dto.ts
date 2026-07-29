import { IsBoolean } from 'class-validator'

/**
 * Переключение запрета копирования контента канала или группы.
 *
 * true — копирование текста, пересылка и сохранение медиа запрещены.
 */
export class SetNoCopyDto {
	@IsBoolean()
	noCopy: boolean
}

import { IsBoolean } from 'class-validator'

/** Переключение комментирования постов канала. */
export class SetCommentsEnabledDto {
	@IsBoolean()
	commentsEnabled: boolean
}

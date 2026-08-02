import { ArrayNotEmpty, IsArray, Matches } from 'class-validator'

/** Пачка чатов для отметки прочитанными или непрочитанными. */
export class MarkChatsDto {
	@IsArray()
	@ArrayNotEmpty()
	@Matches(/^\d+$/, { each: true })
	chatIds: string[]
}

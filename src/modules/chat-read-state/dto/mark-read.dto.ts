import { IsOptional, Matches } from 'class-validator'

/**
 * Отметка прочтения диапазоном.
 *
 * Клиент присылает максимальный увиденный id, а не список: сообщений в поле зрения
 * может быть десяток, и слать по запросу на каждое — лишний трафик и лишние гонки.
 */
export class MarkReadDto {
	@IsOptional()
	@Matches(/^\d+$/, { message: 'upToMessageId must be a positive integer' })
	upToMessageId?: string
}

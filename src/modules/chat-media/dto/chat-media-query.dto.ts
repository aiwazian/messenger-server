import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Постраничная выборка вложений чата.
 *
 * Курсор — id вложения (autoincrement), поэтому порядок по нему совпадает с
 * порядком отправки и не съезжает при появлении новых сообщений, как это было
 * бы с offset.
 */
export class ChatMediaQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	cursorId?: number

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number = 60
}

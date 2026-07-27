import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator'

const ID_PATTERN = /^\d+$/

/**
 * Один DTO на четыре режима загрузки истории:
 * - anchorId  — окно ВОКРУГ сообщения (переход по reply / закрепу / поиску);
 * - beforeId  — страница СТАРШЕ курсора (скролл вверх);
 * - afterId   — страница НОВЕЕ курсора (скролл вниз внутри окна);
 * - без курсоров — последние limit сообщений (открытие чата, кнопка «вниз»).
 *
 * Отдельно anchor=first_unread: клиент не знает id первого непрочитанного
 * до загрузки истории, поэтому якорь выбирает сервер по ChatReadState.
 */
export class GetMessagesWindowDto {
	@IsOptional()
	@Matches(ID_PATTERN, { message: 'anchorId must be a positive integer' })
	anchorId?: string

	/**
	 * first_unread — окно вокруг первого непрочитанного сообщения.
	 * Если непрочитанных нет или они уже удалены — отдаётся конец истории.
	 */
	@IsOptional()
	@IsIn(['first_unread'])
	anchor?: 'first_unread'

	@IsOptional()
	@Matches(ID_PATTERN, { message: 'beforeId must be a positive integer' })
	beforeId?: string

	@IsOptional()
	@Matches(ID_PATTERN, { message: 'afterId must be a positive integer' })
	afterId?: string

	/**
	 * Для anchorId это радиус в каждую сторону (limit=25 => окно ~51 сообщение).
	 * Для before/after — размер страницы.
	 */
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number = 50
}

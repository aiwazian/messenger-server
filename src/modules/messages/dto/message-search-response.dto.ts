import { Exclude, Expose, Type } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class MessageSearchHitDto {
	@Expose()
	id: number

	@Expose()
	senderId: number

	@Expose()
	@OmitNull()
	text?: string

	@Expose()
	sendTime: number
}

@Exclude()
export class MessageSearchResponseDto {
	@Expose()
	@Type(() => MessageSearchHitDto)
	items: MessageSearchHitDto[]

	/** Курсор для следующей страницы результатов. null — больше нечего искать. */
	@Expose()
	@OmitNull()
	nextCursorId?: number

	/** true, если история чата просмотрена до конца. */
	@Expose()
	scannedAll: boolean

	/**
	 * Всего совпадений в чате.
	 *
	 * Приходит только с первой страницей, то есть с запросом без cursorId:
	 * клиент держит число у себя, а повторный проход по истории на каждую
	 * догрузку стоил бы столько же, сколько сам поиск.
	 */
	@Expose()
	@OmitNull()
	total?: number

	/**
	 * false, если подсчёт упёрся в лимит просмотренных сообщений и совпадений
	 * на самом деле может быть больше, чем в total.
	 */
	@Expose()
	@OmitNull()
	totalIsExact?: boolean
}

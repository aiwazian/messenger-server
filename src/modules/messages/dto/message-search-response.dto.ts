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
}

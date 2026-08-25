import { Exclude, Expose, Type } from 'class-transformer'
import { AttachmentType } from '../../../generated/prisma/enums'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class ChatMediaItemDto {
	/** id вложения. Он же курсор следующей страницы. */
	@Expose()
	id: number

	/**
	 * Файл, а не вложение: скачивание и кэш на клиенте живут по fileId.
	 *
	 * У пересланной копии тот же fileId, что у оригинала, поэтому уже скачанное
	 * повторно не качается.
	 */
	@Expose()
	fileId: string

	/** Нужен клиенту для ссылки на скачивание: она выдаётся по паре сообщение + файл. */
	@Expose()
	messageId: number

	@Expose()
	name: string

	@Expose()
	size: number

	@Expose()
	mimeType: string

	@Expose()
	type: AttachmentType

	/** Время отправки сообщения: подпись у файла и порядок в сетке. */
	@Expose()
	sendTime: number
}

@Exclude()
export class ChatMediaResponseDto {
	/** От новых к старым: сетка уходит вниз в глубину истории. */
	@Expose()
	@Type(() => ChatMediaItemDto)
	items: ChatMediaItemDto[]

	/** Курсор следующей страницы. Пусто — история кончилась. */
	@Expose()
	@OmitNull()
	nextCursorId?: number
}

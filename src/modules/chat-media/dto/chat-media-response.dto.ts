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

	/**
	 * Автор сообщения.
	 *
	 * Нужен вкладке голосовых: во второй строке у своих стоит «Вы», у чужих —
	 * название чата. По составу страницы это не вычислить, а тянуть ради подписи
	 * само сообщение — это второй запрос на каждый элемент списка.
	 */
	@Expose()
	senderId: number

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

	/**
	 * Размеры кадра в пикселях — только у фото и видео.
	 *
	 * Сетке галереи они нужны затем же, зачем и чату: держать под элемент место
	 * нужной формы до того, как файл скачался.
	 */
	@Expose()
	@OmitNull()
	width?: number

	@Expose()
	@OmitNull()
	height?: number
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

/**
 * Сколько вложений в чате всего.
 *
 * Считается по всему чату, а не по загруженной странице: подзаголовок в шапке
 * галереи показывает «142 фото, 421 видео» сразу, а страницами к этому числу
 * пришлось бы прокручивать всю историю.
 *
 * Фото и видео разделены, потому что лежат на одной вкладке и в подписи стоят
 * рядом; документы и голосовые — каждый на своей.
 */
@Exclude()
export class ChatMediaCountsResponseDto {
	@Expose()
	photos: number

	@Expose()
	videos: number

	@Expose()
	files: number

	@Expose()
	voices: number
}

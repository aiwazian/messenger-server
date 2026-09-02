import { Exclude, Expose, Type } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'
import { AttachmentType, MessageType } from '../../../generated/prisma/enums'
import { ForwardSourceAccess } from '../../../common/enums/forward-source-access.enum'

@Exclude()
export class MessageAttachmentDto {
	@Expose()
	fileId: string

	@Expose()
	name: string

	@Expose()
	size: number

	@Expose()
	mimeType: string

	@Expose()
	status: string

	@Expose()
	type: AttachmentType

	/**
	 * Размеры кадра в пикселях — только у фото и видео.
	 *
	 * Нужны до скачивания файла: по ним чат держит под вложение место нужной
	 * формы, пока идёт загрузка, вместо одного прямоугольника на все случаи.
	 *
	 * Отсутствуют у документов и голосовых, а также у медиа, отправленного
	 * старым клиентом: он размеров не присылал.
	 */
	@Expose()
	@OmitNull()
	width?: number

	@Expose()
	@OmitNull()
	height?: number
}

@Exclude()
export class MessageReadInfoDto {
	@Expose()
	userId: number

	@Expose()
	firstName: string

	@Expose()
	lastName?: string

	@Expose()
	readAt: number
}

@Exclude()
export class MessageReplyPreviewDto {
	@Expose()
	id: number

	@Expose()
	senderId: number

	/** Чат цитируемого сообщения: может отличаться от текущего. */
	@Expose()
	@OmitNull()
	chatId?: number

	@Expose()
	@OmitNull()
	text?: string

	@Expose()
	messageType: MessageType

	/** Имя автора — заголовок ответа в личном чате. */
	@Expose()
	@OmitNull()
	senderName?: string

	/** Название группы/канала — заголовок ответа в группе/канале. */
	@Expose()
	@OmitNull()
	chatName?: string

	/** Типы вложений: клиент покажет «Фото»/«Видео»/«Голосовое сообщение» вместо пустого текста. */
	@Expose()
	@OmitNull()
	attachmentTypes?: AttachmentType[]
}

@Exclude()
export class MessageResponseDto {
	@Expose()
	id: number

	@Expose()
	senderId: number

	@Expose()
	chatId: number

	@Expose()
	@OmitNull()
	text?: string

	@Expose()
	sendTime: number

	/**
	 * Сообщение редактировали.
	 *
	 * Лежит в Postgres, поэтому подпись «изменено» у сообщения остаётся навсегда.
	 * Нетронутым сообщениям поле не отдаётся вовсе: false в каждом сообщении
	 * страницы — это лишний трафик ради значения по умолчанию.
	 */
	@Expose()
	@OmitNull()
	isEdited?: boolean

	/**
	 * Когда именно отредактировали.
	 *
	 * Живёт трое суток в Redis, поэтому у старой правки остаётся один isEdited
	 * без времени: клиент показывает «изменено» без уточнения когда.
	 */
	@Expose()
	@OmitNull()
	editedAt?: number

	@Expose()
	@OmitNull()
	isRead?: boolean

	@Expose()
	messageType: MessageType

	@Expose()
	@OmitNull()
	attachments: MessageAttachmentDto[]

	@Expose()
	@OmitNull()
	systemEventType?: string

	/**
	 * Кто прочитал сообщение в группе.
	 *
	 * Приходит только автору сообщения и отсортирован от свежих прочтений к старым:
	 * клиент показывает его в меню сообщения как «N просмотров».
	 */
	@Expose()
	@OmitNull()
	readInfo?: MessageReadInfoDto[]

	/** id сообщения, на которое ответили. Нужен клиенту для прыжка к оригиналу. */
	@Expose()
	@OmitNull()
	replyToId?: number

	/** Чат цитируемого сообщения — ответ может быть на сообщение из другого чата. */
	@Expose()
	@OmitNull()
	replyToChatId?: number

	/** Источник пересылки: всегда автор контента, а не посредник. */
	@Expose()
	@OmitNull()
	forwardedFromChatId?: number

	/** Готовое название для заголовка «Переслано от …». */
	@Expose()
	@OmitNull()
	forwardedFromName?: string

	/**
	 * Можно ли открыть источник по тапу по заголовку.
	 *
	 * Считается на момент чтения, поэтому после подписки на закрытый канал
	 * старые пересланные сообщения станут кликабельными сами.
	 */
	@Expose()
	@OmitNull()
	forwardedFromAccess?: ForwardSourceAccess

	/** Короткое превью цитируемого сообщения, чтобы не грузить его отдельным запросом. */
	@Expose()
	@OmitNull()
	@Type(() => MessageReplyPreviewDto)
	replyTo?: MessageReplyPreviewDto
}

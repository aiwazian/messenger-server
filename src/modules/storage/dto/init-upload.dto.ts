import { Exclude, Expose } from 'class-transformer'

/**
 * Ответ на инициализацию загрузки: форма presigned POST.
 *
 * Вместо одного signedUrl клиент получает адрес и набор подписанных полей.
 * Отправить их нужно в multipart/form-data строго до поля file.
 */
@Exclude()
export class InitUploadDto {
	@Expose()
	url: string

	@Expose()
	fields: Record<string, string>

	@Expose()
	fileId: string

	/** Лимит размера, чтобы клиент отсёк слишком большой файл до отправки. */
	@Expose()
	maxSizeBytes: number
}

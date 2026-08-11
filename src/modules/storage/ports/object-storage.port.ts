/**
 * Порт объектного хранилища.
 *
 * Логика загрузки и скачивания зависит от этого интерфейса, а не от AWS SDK:
 * заменить S3 на другое хранилище можно новой реализацией порта и одной
 * строчкой в модуле, не трогая сервисы.
 */

export interface PresignedUploadForm {
	/** URL, на который клиент отправляет multipart/form-data POST. */
	url: string

	/**
	 * Поля политики. Клиент обязан отправить их без изменений и строго до
	 * поля file: S3 читает форму потоком и всё после file игнорирует.
	 */
	fields: Record<string, string>
}

export interface CreateUploadFormInput {
	key: string
	contentType: string
	minSizeBytes: number
	maxSizeBytes: number
	expiresInSeconds: number
}

export interface CreateDownloadUrlInput {
	key: string
	expiresInSeconds: number
}

export interface ObjectStoragePort {
	/** Подписанная форма загрузки с зашитыми в политику ограничениями. */
	createUploadForm(input: CreateUploadFormInput): Promise<PresignedUploadForm>

	createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>

	/** Первые байты объекта: по ним определяется реальный тип содержимого. */
	readHead(key: string, byteLength: number): Promise<Buffer>

	deleteObject(key: string): Promise<void>
}

/** DI-токен: потребители инжектят интерфейс, а не конкретную реализацию. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE')

/**
 * Порт объектного хранилища.
 *
 * Логика загрузки и скачивания зависит от этого интерфейса, а не от AWS SDK:
 * заменить S3 на другое хранилище можно новой реализацией порта и одной
 * строчкой в модуле, не трогая сервисы.
 */

/**
 * Бакет, в котором лежит объект.
 *
 * Здесь роль, а не имя: какое имя бакета соответствует роли, знает только
 * реализация порта. Разделение нужно потому, что публичный доступ
 * настраивается на бакет целиком: файлы, которые раздаются через CDN без
 * подписи, не могут лежать рядом с приватными.
 */
export enum StorageBucket {
	PRIVATE = 'PRIVATE',
	PUBLIC = 'PUBLIC'
}

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
	bucket: StorageBucket
	contentType: string
	minSizeBytes: number
	maxSizeBytes: number
	expiresInSeconds: number
}

export interface CreateDownloadUrlInput {
	key: string
	bucket: StorageBucket
	expiresInSeconds: number
}

export interface ObjectStoragePort {
	/** Подписанная форма загрузки с зашитыми в политику ограничениями. */
	createUploadForm(input: CreateUploadFormInput): Promise<PresignedUploadForm>

	createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>

	/** Первые байты объекта: по ним определяется реальный тип содержимого. */
	readHead(key: string, byteLength: number, bucket: StorageBucket): Promise<Buffer>

	deleteObject(key: string, bucket: StorageBucket): Promise<void>
}

/** DI-токен: потребители инжектят интерфейс, а не конкретную реализацию. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE')

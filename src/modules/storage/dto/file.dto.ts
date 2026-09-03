export class FileDto {
	id: string
	name: string
	size: string
	mimeType: string
	status: string

	/**
	 * Размеры кадра в пикселях.
	 *
	 * Пусты у всего, что не фото и не видео, и у файлов от старых клиентов:
	 * измеряет кадр отправитель, сервер сам его не открывает.
	 */
	width?: number | null
	height?: number | null
}

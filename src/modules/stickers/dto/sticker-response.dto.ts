import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class StickerResponseDto {
	@Expose()
	id: string

	/**
	 * Идентификатор файла в хранилище.
	 *
	 * Нужен клиенту ключом кэша картинки: он не меняется никогда, а вот домен
	 * в url может смениться вместе с CDN.
	 */
	@Expose()
	fileId: string

	/** Постоянная ссылка на картинку: без подписи и без срока жизни. */
	@Expose()
	url: string

	@Expose()
	sortOrder: number
}

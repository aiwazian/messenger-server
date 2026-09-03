import { Exclude, Expose } from 'class-transformer'
import {
	IsEnum,
	IsInt,
	IsMimeType,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min
} from 'class-validator'
import { UploadCategory } from '../../../common/enums/upload-category.enum'
import {
	MAX_UPLOAD_SIZE_BYTES,
	MIN_UPLOAD_SIZE_BYTES
} from '../../storage/constants/upload.constants'

/**
 * Верхняя граница размеров кадра в пикселях.
 *
 * Ни одно реальное фото или видео до неё не доходит: граница стоит только
 * чтобы отсечь мусор. Размеры измеряет отправитель, по самому файлу сервер их
 * не перепроверяет, поэтому без неё в базу могло бы лечь число, которое потом
 * растянет карточку вложения на весь экран у получателя.
 */
const MAX_MEDIA_DIMENSION_PX = 100_000

@Exclude()
export class FileInitDto {
	@Expose()
	@IsString()
	@MaxLength(255)
	name: string

	@Expose()
	@IsInt()
	@Min(MIN_UPLOAD_SIZE_BYTES)
	@Max(MAX_UPLOAD_SIZE_BYTES)
	size: number

	@Expose()
	@IsMimeType()
	mimeType: string

	/**
	 * Что именно пользователь собирается загрузить.
	 *
	 * Из неё выводится условие политики: объявил image — S3 не примет ничего,
	 * кроме image/*. Необязательна ради совместимости со старыми клиентами:
	 * без неё действует общий режим FILE, а для аватаров категорию всё равно
	 * назначает сервер.
	 */
	@Expose()
	@IsOptional()
	@IsEnum(UploadCategory)
	category?: UploadCategory

	/**
	 * Ширина кадра в пикселях — только у фото и видео.
	 *
	 * Приходит уже с учётом поворота: измеряет отправитель, который знает и
	 * EXIF снимка, и поворот дорожки видео.
	 *
	 * Необязательна: у документов и голосовых кадра нет вовсе, а старые
	 * клиенты размеров не присылают — там вложение остаётся без них, и чат
	 * рисует карточку по прежнему правилу.
	 */
	@Expose()
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(MAX_MEDIA_DIMENSION_PX)
	width?: number

	/** Высота кадра в пикселях. Условия те же, что у [FileInitDto.width]. */
	@Expose()
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(MAX_MEDIA_DIMENSION_PX)
	height?: number
}

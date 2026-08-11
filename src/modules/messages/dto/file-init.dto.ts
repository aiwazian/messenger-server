import { Exclude, Expose } from 'class-transformer'
import { IsEnum, IsInt, IsMimeType, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { UploadCategory } from '../../../common/enums/upload-category.enum'
import {
	MAX_UPLOAD_SIZE_BYTES,
	MIN_UPLOAD_SIZE_BYTES
} from '../../storage/constants/upload.constants'

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
}

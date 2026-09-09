import {
	IsInt,
	IsMimeType,
	IsNumberString,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
	MinLength
} from 'class-validator'
import {
	MAX_STICKER_SIZE_BYTES,
	MIN_UPLOAD_SIZE_BYTES
} from '../../storage/constants/upload.constants'

const MAX_STICKER_FILE_NAME_LENGTH = 255
const MAX_STICKER_DIMENSION_PX = 2048

export class StickerUploadInitDto {
	@IsString()
	@MinLength(1)
	@MaxLength(MAX_STICKER_FILE_NAME_LENGTH)
	name: string

	@IsInt()
	@Min(MIN_UPLOAD_SIZE_BYTES)
	@Max(MAX_STICKER_SIZE_BYTES)
	size: number

	@IsMimeType()
	mimeType: string

	@IsNumberString()
	packId: string

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(MAX_STICKER_DIMENSION_PX)
	width?: number

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(MAX_STICKER_DIMENSION_PX)
	height?: number
}

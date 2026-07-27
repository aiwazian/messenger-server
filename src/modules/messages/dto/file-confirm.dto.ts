import { Exclude, Expose, Type } from 'class-transformer'
import { IsString, IsOptional, IsArray, IsNumberString, ValidateNested } from 'class-validator'
import { AttachmentInputDto } from './attachment-input.dto'

@Exclude()
export class FileConfirmDto {
	@Expose()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => AttachmentInputDto)
	attachments: AttachmentInputDto[]

	@Expose()
	@IsOptional()
	@IsString()
	text?: string

	/** id сообщения, на которое отвечаем (ответ фото/видео/файлом). */
	@Expose()
	@IsOptional()
	@IsNumberString()
	replyToId?: string
}

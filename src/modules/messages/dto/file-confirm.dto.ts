import { Exclude, Expose, Type } from 'class-transformer'
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator'
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
}

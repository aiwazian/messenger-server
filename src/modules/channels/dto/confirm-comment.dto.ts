import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { AttachmentInputDto } from '../../messages/dto/attachment-input.dto'
import { Trim } from '../../../common/decorators/trim.decorator'

export class ConfirmCommentDto {
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => AttachmentInputDto)
	attachments: AttachmentInputDto[]

	@IsOptional()
	@IsString()
	@Trim()
	@MaxLength(5000)
	text?: string
}

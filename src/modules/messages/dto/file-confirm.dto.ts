import { Exclude, Expose } from 'class-transformer'
import { IsString, IsOptional, IsEnum } from 'class-validator'
import { AttachmentType } from '../../../../generated/prisma/enums'

@Exclude()
export class FileConfirmDto {
	@Expose()
	@IsString()
	fileId: string

	@Expose()
	@IsOptional()
	@IsEnum(AttachmentType)
	type?: AttachmentType

	@Expose()
	@IsOptional()
	@IsString()
	text?: string
}

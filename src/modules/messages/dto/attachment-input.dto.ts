import { Expose } from 'class-transformer'
import { IsString, IsEnum } from 'class-validator'
import { AttachmentType } from '../../../../generated/prisma/enums'

export class AttachmentInputDto {
	@Expose()
	@IsString()
	fileId: string

	@Expose()
	@IsEnum(AttachmentType)
	type: AttachmentType
}

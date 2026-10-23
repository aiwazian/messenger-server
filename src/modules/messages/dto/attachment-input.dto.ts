import { Expose } from 'class-transformer'
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator'
import { AttachmentType } from '../../../generated/prisma/enums'

export class AttachmentInputDto {
	@Expose()
	@IsString()
	fileId: string

	@Expose()
	@IsEnum(AttachmentType)
	type: AttachmentType

	@Expose()
	@IsOptional()
	@IsBoolean()
	viewOnce?: boolean

	@Expose()
	@IsOptional()
	@IsIn([3, 10, 30])
	viewOnceSeconds?: number
}

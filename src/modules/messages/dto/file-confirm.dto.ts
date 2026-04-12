import { Exclude, Expose } from 'class-transformer'
import { IsString, IsOptional } from 'class-validator'

@Exclude()
export class FileConfirmDto {
	@Expose()
	@IsString()
	fileId: string

	@Expose()
	@IsOptional()
	@IsString()
	text?: string
}

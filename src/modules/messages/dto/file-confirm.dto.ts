import { IsString, IsOptional } from 'class-validator'

export class FileConfirmDto {
	@IsString()
	fileId: string

	@IsOptional()
	@IsString()
	text?: string
}

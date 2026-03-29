import { IsString, IsNumber, IsMimeType } from 'class-validator'

export class FileInitDto {
	@IsString()
	name: string

	@IsNumber()
	size: number

	@IsMimeType()
	mimeType: string
}

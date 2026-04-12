import { Exclude, Expose } from 'class-transformer'
import { IsString, IsNumber, IsMimeType } from 'class-validator'

@Exclude()
export class FileInitDto {
	@Expose()
	@IsString()
	name: string

	@Expose()
	@IsNumber()
	size: number

	@Expose()
	@IsMimeType()
	mimeType: string
}

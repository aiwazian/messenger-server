import { IsString, IsOptional, IsArray } from 'class-validator'

export class MediaMessageDto {
	@IsOptional()
	@IsString()
	text?: string

	@IsArray()
	@IsString({ each: true })
	fileIds: string[]
}

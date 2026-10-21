import { Transform } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsNumberString,
	IsOptional,
	IsString
} from 'class-validator'

export class ForwardMessageDto {
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(30)
	@Transform(({ value }) => (Array.isArray(value) ? value.map((v) => String(v)) : value))
	@IsNumberString({}, { each: true })
	targetChatIds: string[]

	@IsOptional()
	@IsBoolean()
	hideAuthor: boolean = false

	@IsOptional()
	@IsBoolean()
	hideCaption: boolean = false

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	fileIds?: string[]
}

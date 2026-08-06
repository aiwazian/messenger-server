import {
	ArrayMaxSize,
	IsArray,
	IsEnum,
	IsNumberString,
	IsOptional,
	IsString,
	MaxLength,
	MinLength
} from 'class-validator'
import { ChatFolderCategory } from '../../../generated/prisma/enums'

export class UpdateChatFolderDto {
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(64)
	name?: string

	/// Полная замена состава папки: приходит итоговый список, а не дельта.
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(500)
	@IsNumberString({}, { each: true })
	chatIds?: string[]

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(3)
	@IsEnum(ChatFolderCategory, { each: true })
	categories?: ChatFolderCategory[]
}

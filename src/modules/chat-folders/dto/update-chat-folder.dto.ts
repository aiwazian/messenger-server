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
import { MAX_FOLDER_NAME_LENGTH } from './chat-folder.constants'

export class UpdateChatFolderDto {
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(MAX_FOLDER_NAME_LENGTH)
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

import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNumberString } from 'class-validator'

export class PinFolderChatsDto {
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(500)
	@IsNumberString({}, { each: true })
	chatIds: string[]
}

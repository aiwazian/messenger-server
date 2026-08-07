import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator'

export class ReorderChatFoldersDto {
	@IsArray()
	@ArrayNotEmpty()
	@IsInt({ each: true })
	folderIds: number[]
}

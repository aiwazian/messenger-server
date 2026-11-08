import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNumberString } from 'class-validator'

export class PinChatsDto {
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(100)
	@IsNumberString({}, { each: true })
	chatIds: string[]
}

import { IsNotEmpty, IsNumberString, IsOptional } from 'class-validator'

export class StickerMessageDto {
	@IsNumberString()
	@IsNotEmpty()
	stickerId: string

	@IsOptional()
	@IsNumberString()
	replyToId?: string
}

import { IsBoolean, IsNotEmpty, IsNumberString, IsOptional } from 'class-validator'

export class StickerMessageDto {
	@IsNumberString()
	@IsNotEmpty()
	stickerId: string

	@IsOptional()
	@IsNumberString()
	replyToId?: string

	@IsOptional()
	@IsBoolean()
	silent?: boolean

	@IsOptional()
	@IsNumberString()
	scheduledAt?: string
}

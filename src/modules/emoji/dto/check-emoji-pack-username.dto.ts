import { IsNumberString, IsOptional, IsString } from 'class-validator'

export class CheckEmojiPackUsernameDto {
	@IsString()
	username: string

	@IsOptional()
	@IsNumberString()
	packId?: string
}

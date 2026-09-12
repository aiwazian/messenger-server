import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'

export class GetEmojiPacksDto {
	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	includeEmojis?: boolean
}

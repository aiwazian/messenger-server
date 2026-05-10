import { IsBoolean, IsOptional } from 'class-validator'
import { Transform } from 'class-transformer'

export class ClearHistoryDto {
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	clearForRecipient?: boolean = false
}

import { IsBoolean, IsOptional } from 'class-validator'
import { Transform } from 'class-transformer'

export class DeleteMessageDto {
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	deleteForRecipient?: boolean = false
}

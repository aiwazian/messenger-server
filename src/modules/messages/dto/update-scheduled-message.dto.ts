import { IsNotEmpty, IsNumberString } from 'class-validator'

export class UpdateScheduledMessageDto {
	@IsNumberString()
	@IsNotEmpty()
	scheduledAt: string
}

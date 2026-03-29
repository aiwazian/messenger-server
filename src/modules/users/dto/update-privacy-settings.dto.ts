import { IsNumber, IsOptional, Max, Min } from 'class-validator'

export class UpdatePrivacySettingsDto {
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(2)
	lastSeen?: number

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(2)
	messages?: number

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	bio?: number

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	dateOfBirth?: number

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(2)
	invites?: number
}

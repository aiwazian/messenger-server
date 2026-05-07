import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class CreateInviteLinkDto {
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100000)
	maxUses?: number

	@IsOptional()
	@IsInt()
	expiresAt?: number
}

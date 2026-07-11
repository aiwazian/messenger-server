import { IsInt, IsOptional, Max, Min, IsBoolean } from 'class-validator'

export class CreateInviteLinkDto {
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100000)
	maxUses?: number

	@IsOptional()
	@IsInt()
	expiresAt?: number

	@IsOptional()
	@IsBoolean()
	requireApproval?: boolean
}

import { IsOptional } from 'class-validator'

export class CreateInviteLinkDto {
	@IsOptional()
	maxUses?: number

	@IsOptional()
	expiresInSeconds?: number
}

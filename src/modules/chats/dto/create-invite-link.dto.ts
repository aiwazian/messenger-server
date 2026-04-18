import { IsNotEmpty, IsOptional } from 'class-validator'

export class CreateInviteLinkDto {
	@IsNotEmpty()
	chatId: number

	@IsOptional()
	maxUses?: number

	@IsOptional()
	expiresInSeconds?: number
}

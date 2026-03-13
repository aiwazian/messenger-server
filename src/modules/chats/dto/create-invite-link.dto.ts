import { IsOptional, IsString } from 'class-validator'

export class CreateInviteLinkDto {
    @IsOptional()
    @IsString()
    channelId?: string

    @IsOptional()
    @IsString()
    groupId?: string

    @IsOptional()
    maxUses?: number

    @IsOptional()
    expiresInSeconds?: number
}

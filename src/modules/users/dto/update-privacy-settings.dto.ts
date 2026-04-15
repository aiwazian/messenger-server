import { IsEnum, IsOptional } from 'class-validator'
import { PrivacyRule } from '../../../../generated/prisma/enums'

export class UpdatePrivacySettingsDto {
	@IsOptional()
	@IsEnum(PrivacyRule)
	lastSeen?: PrivacyRule

	@IsOptional()
	@IsEnum(PrivacyRule)
	messages?: PrivacyRule

	@IsOptional()
	@IsEnum(PrivacyRule)
	bio?: PrivacyRule

	@IsOptional()
	@IsEnum(PrivacyRule)
	dateOfBirth?: PrivacyRule

	@IsOptional()
	@IsEnum(PrivacyRule)
	invites?: PrivacyRule
}

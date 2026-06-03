import { Exclude, Expose } from 'class-transformer'
import { PrivacyRule } from '../../../../generated/prisma/enums'

@Exclude()
export class PrivacySettingsDto {
	@Expose()
	lastSeen: PrivacyRule

	@Expose()
	messages: PrivacyRule

	@Expose()
	bio: PrivacyRule

	@Expose()
	dateOfBirth: PrivacyRule

	@Expose()
	invites: PrivacyRule

	@Expose()
	deleteAfterDays: number
}

import { Exclude, Expose, Type } from 'class-transformer'
import { PrivacyRule } from '../../../generated/prisma/enums'
import { PrivacyExceptionsResponseDto } from './privacy-exceptions.dto'

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
	profilePhoto: PrivacyRule

	@Expose()
	forwardedProfile: PrivacyRule

	@Expose()
	forwardAndCopy: PrivacyRule

	@Expose()
	deleteAfterDays: number

	@Expose()
	@Type(() => PrivacyExceptionsResponseDto)
	exceptions: PrivacyExceptionsResponseDto
}

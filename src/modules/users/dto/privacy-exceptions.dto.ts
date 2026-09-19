import { Expose, Type } from 'class-transformer'
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator'
import { PrivacyField } from '../../../generated/prisma/enums'

export type PrivacyFieldKey =
	| 'lastSeen'
	| 'messages'
	| 'bio'
	| 'dateOfBirth'
	| 'invites'
	| 'profilePhoto'
	| 'forwardedProfile'
	| 'forwardAndCopy'

export const PRIVACY_FIELD_KEYS: PrivacyFieldKey[] = [
	'lastSeen',
	'messages',
	'bio',
	'dateOfBirth',
	'invites',
	'profilePhoto',
	'forwardedProfile',
	'forwardAndCopy'
]

export const PRIVACY_FIELD_BY_KEY: Record<PrivacyFieldKey, PrivacyField> = {
	lastSeen: PrivacyField.LAST_SEEN,
	messages: PrivacyField.MESSAGES,
	bio: PrivacyField.BIO,
	dateOfBirth: PrivacyField.DATE_OF_BIRTH,
	invites: PrivacyField.INVITES,
	profilePhoto: PrivacyField.PROFILE_PHOTO,
	forwardedProfile: PrivacyField.FORWARDED_PROFILE,
	forwardAndCopy: PrivacyField.FORWARD_AND_COPY
}

export const PRIVACY_KEY_BY_FIELD: Record<PrivacyField, PrivacyFieldKey> = {
	[PrivacyField.LAST_SEEN]: 'lastSeen',
	[PrivacyField.MESSAGES]: 'messages',
	[PrivacyField.BIO]: 'bio',
	[PrivacyField.DATE_OF_BIRTH]: 'dateOfBirth',
	[PrivacyField.INVITES]: 'invites',
	[PrivacyField.PROFILE_PHOTO]: 'profilePhoto',
	[PrivacyField.FORWARDED_PROFILE]: 'forwardedProfile',
	[PrivacyField.FORWARD_AND_COPY]: 'forwardAndCopy'
}

export class PrivacyExceptionListsDto {
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	alwaysShow?: string[]

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	alwaysHide?: string[]
}

export class PrivacyExceptionsUpdateDto {
	@IsOptional()
	@ValidateNested()
	@Type(() => PrivacyExceptionListsDto)
	lastSeen?: PrivacyExceptionListsDto

	@IsOptional()
	@ValidateNested()
	@Type(() => PrivacyExceptionListsDto)
	messages?: PrivacyExceptionListsDto

	@IsOptional()
	@ValidateNested()
	@Type(() => PrivacyExceptionListsDto)
	bio?: PrivacyExceptionListsDto

	@IsOptional()
	@ValidateNested()
	@Type(() => PrivacyExceptionListsDto)
	dateOfBirth?: PrivacyExceptionListsDto

	@IsOptional()
	@ValidateNested()
	@Type(() => PrivacyExceptionListsDto)
	invites?: PrivacyExceptionListsDto

	@IsOptional()
	@ValidateNested()
	@Type(() => PrivacyExceptionListsDto)
	profilePhoto?: PrivacyExceptionListsDto

	@IsOptional()
	@ValidateNested()
	@Type(() => PrivacyExceptionListsDto)
	forwardedProfile?: PrivacyExceptionListsDto

	@IsOptional()
	@ValidateNested()
	@Type(() => PrivacyExceptionListsDto)
	forwardAndCopy?: PrivacyExceptionListsDto
}

export class PrivacyExceptionListsResponseDto {
	@Expose()
	alwaysShow: string[]

	@Expose()
	alwaysHide: string[]

	constructor(alwaysShow: string[] = [], alwaysHide: string[] = []) {
		this.alwaysShow = alwaysShow
		this.alwaysHide = alwaysHide
	}
}

export class PrivacyExceptionsResponseDto {
	@Expose()
	@Type(() => PrivacyExceptionListsResponseDto)
	lastSeen?: PrivacyExceptionListsResponseDto

	@Expose()
	@Type(() => PrivacyExceptionListsResponseDto)
	messages?: PrivacyExceptionListsResponseDto

	@Expose()
	@Type(() => PrivacyExceptionListsResponseDto)
	bio?: PrivacyExceptionListsResponseDto

	@Expose()
	@Type(() => PrivacyExceptionListsResponseDto)
	dateOfBirth?: PrivacyExceptionListsResponseDto

	@Expose()
	@Type(() => PrivacyExceptionListsResponseDto)
	invites?: PrivacyExceptionListsResponseDto

	@Expose()
	@Type(() => PrivacyExceptionListsResponseDto)
	profilePhoto?: PrivacyExceptionListsResponseDto

	@Expose()
	@Type(() => PrivacyExceptionListsResponseDto)
	forwardedProfile?: PrivacyExceptionListsResponseDto

	@Expose()
	@Type(() => PrivacyExceptionListsResponseDto)
	forwardAndCopy?: PrivacyExceptionListsResponseDto
}

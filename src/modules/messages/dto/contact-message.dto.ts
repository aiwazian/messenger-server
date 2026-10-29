import {
	ArrayMaxSize,
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsOptional,
	IsString,
	MaxLength
} from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'
import {
	CONTACT_ADDRESS_MAX_LENGTH,
	CONTACT_BIRTHDAY_MAX_LENGTH,
	CONTACT_EMAIL_MAX_LENGTH,
	CONTACT_JOB_TITLE_MAX_LENGTH,
	CONTACT_NAME_MAX_LENGTH,
	CONTACT_ORGANIZATION_MAX_LENGTH,
	CONTACT_PHONE_MAX_LENGTH,
	CONTACT_URL_MAX_LENGTH,
	MAX_CONTACT_ADDRESSES,
	MAX_CONTACT_EMAILS,
	MAX_CONTACT_PHONES,
	MAX_CONTACT_URLS
} from '../message-limits.const'

export class ContactMessageDto {
	@IsString()
	@Trim()
	@MaxLength(CONTACT_NAME_MAX_LENGTH)
	name: string

	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(MAX_CONTACT_PHONES)
	@IsString({ each: true })
	@MaxLength(CONTACT_PHONE_MAX_LENGTH, { each: true })
	phones: string[]

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(MAX_CONTACT_EMAILS)
	@IsString({ each: true })
	@MaxLength(CONTACT_EMAIL_MAX_LENGTH, { each: true })
	emails?: string[]

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(MAX_CONTACT_URLS)
	@IsString({ each: true })
	@MaxLength(CONTACT_URL_MAX_LENGTH, { each: true })
	urls?: string[]

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(MAX_CONTACT_ADDRESSES)
	@IsString({ each: true })
	@MaxLength(CONTACT_ADDRESS_MAX_LENGTH, { each: true })
	addresses?: string[]

	@IsOptional()
	@IsString()
	@Trim()
	@MaxLength(CONTACT_ORGANIZATION_MAX_LENGTH)
	organization?: string

	@IsOptional()
	@IsString()
	@Trim()
	@MaxLength(CONTACT_JOB_TITLE_MAX_LENGTH)
	jobTitle?: string

	@IsOptional()
	@IsString()
	@Trim()
	@MaxLength(CONTACT_BIRTHDAY_MAX_LENGTH)
	birthday?: string

	@IsOptional()
	@IsBoolean()
	silent?: boolean
}

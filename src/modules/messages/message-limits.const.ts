import { AttachmentType } from '../../generated/prisma/enums'

export const MAX_MEDIA_ATTACHMENTS_PER_MESSAGE = 10

export const MEDIA_ATTACHMENT_TYPES: AttachmentType[] = [AttachmentType.IMAGE, AttachmentType.VIDEO]

export const CONTACT_NAME_MAX_LENGTH = 100
export const CONTACT_PHONE_MAX_LENGTH = 32
export const CONTACT_EMAIL_MAX_LENGTH = 254
export const CONTACT_URL_MAX_LENGTH = 100
export const CONTACT_ADDRESS_MAX_LENGTH = 256
export const CONTACT_ORGANIZATION_MAX_LENGTH = 100
export const CONTACT_JOB_TITLE_MAX_LENGTH = 100
export const CONTACT_BIRTHDAY_MAX_LENGTH = 32

export const MAX_CONTACT_PHONES = 10
export const MAX_CONTACT_EMAILS = 10
export const MAX_CONTACT_URLS = 10
export const MAX_CONTACT_ADDRESSES = 10

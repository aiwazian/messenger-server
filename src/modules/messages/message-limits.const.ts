import { AttachmentType } from '../../generated/prisma/enums'

export const MAX_MEDIA_ATTACHMENTS_PER_MESSAGE = 10

export const MEDIA_ATTACHMENT_TYPES: AttachmentType[] = [AttachmentType.IMAGE, AttachmentType.VIDEO]

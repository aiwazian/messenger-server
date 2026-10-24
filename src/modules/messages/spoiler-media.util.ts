import { BadRequestException } from '@nestjs/common'
import { AttachmentType } from '../../generated/prisma/enums'
import { AttachmentInputDto } from './dto/attachment-input.dto'

export function hasSpoilerMetadata(attachment: AttachmentInputDto): boolean {
	return attachment.spoiler === true
}

export function assertValidSpoilerAttachment(
	attachment: AttachmentInputDto,
	attachmentType: AttachmentType
): void {
	if (!hasSpoilerMetadata(attachment)) return

	if (attachmentType !== AttachmentType.IMAGE && attachmentType !== AttachmentType.VIDEO) {
		throw new BadRequestException('Spoiler media is only supported for images and videos')
	}
}

export function resolveAttachmentSpoiler(attachment: AttachmentInputDto): boolean {
	return attachment.spoiler === true && attachment.viewOnce !== true
}

export function assertNoSpoilerMetadata(attachments: AttachmentInputDto[]): void {
	if (attachments.some(hasSpoilerMetadata)) {
		throw new BadRequestException('Spoiler media is not supported in comments')
	}
}

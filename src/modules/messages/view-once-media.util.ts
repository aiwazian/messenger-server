import { BadRequestException } from '@nestjs/common'
import { AttachmentType } from '../../generated/prisma/enums'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { ChatId } from '../../common/types/chat-id.type'
import { UserId } from '../../common/types/user-id.type'
import { AttachmentInputDto } from './dto/attachment-input.dto'

export const VIEW_ONCE_SECONDS = [3, 10, 30] as const

export function hasViewOnceMetadata(attachment: AttachmentInputDto): boolean {
	return attachment.viewOnce === true || attachment.viewOnceSeconds != null
}

export function assertViewOnceChatAllowed(
	userId: UserId,
	chatId: ChatId,
	attachments: AttachmentInputDto[]
): void {
	if (!attachments.some(hasViewOnceMetadata)) return

	const chatType = detectChatType(chatId)
	const isSavedMessages = BigInt(chatId) === BigInt(userId)

	if (chatType !== ChatType.PRIVATE || isSavedMessages) {
		throw new BadRequestException('View-once media is only available in private chats')
	}
}

export function assertValidViewOnceAttachment(
	attachment: AttachmentInputDto,
	attachmentType: AttachmentType,
	mimeType: string
): void {
	if (!hasViewOnceMetadata(attachment)) return

	if (attachment.viewOnce !== true) {
		throw new BadRequestException('viewOnceSeconds can only be used together with viewOnce')
	}

	if (attachmentType !== AttachmentType.IMAGE && attachmentType !== AttachmentType.VIDEO) {
		throw new BadRequestException('View-once media is only supported for images and videos')
	}

	if (mimeType.toLowerCase() === 'image/gif') {
		throw new BadRequestException('View-once media is not supported for GIFs')
	}

	if (
		attachment.viewOnceSeconds != null &&
		!VIEW_ONCE_SECONDS.includes(attachment.viewOnceSeconds as (typeof VIEW_ONCE_SECONDS)[number])
	) {
		throw new BadRequestException('viewOnceSeconds must be one of 3, 10 or 30')
	}
}

export function assertNoViewOnceMetadata(attachments: AttachmentInputDto[]): void {
	if (attachments.some(hasViewOnceMetadata)) {
		throw new BadRequestException('View-once media is not supported in comments')
	}
}

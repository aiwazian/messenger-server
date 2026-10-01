import { Prisma } from '../../generated/prisma/client'

export const COMMENT_INCLUDE = {
	attachments: { include: { file: true } },
	sticker: {
		select: {
			id: true,
			packId: true,
			fileId: true,
			emojis: true
		}
	},
	replyTo: {
		select: {
			id: true,
			senderId: true,
			text: true,
			messageType: true,
			encryptionKeyVersion: true,
			sticker: { select: { emojis: true } },
			sender: { select: { firstName: true, lastName: true } }
		}
	},
	sender: {
		select: {
			id: true,
			firstName: true,
			lastName: true
		}
	}
} satisfies Prisma.CommentInclude

export type CommentWithRelations = Prisma.CommentGetPayload<{
	include: typeof COMMENT_INCLUDE
}>

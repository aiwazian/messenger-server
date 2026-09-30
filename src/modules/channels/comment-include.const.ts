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

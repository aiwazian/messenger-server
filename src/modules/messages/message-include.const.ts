import { Prisma } from '../../generated/prisma/client'

export const MESSAGE_INCLUDE = {
	attachments: { include: { file: true } },
	systemEvent: { select: { eventType: true } },
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
			chatId: true,
			text: true,
			encryptionKeyVersion: true,
			messageType: true,
			sender: { select: { firstName: true, lastName: true } },
			attachments: { select: { type: true }, orderBy: { sortOrder: 'asc' } }
		}
	}
} satisfies Prisma.MessageInclude

export type MessageWithRelations = Prisma.MessageGetPayload<{
	include: typeof MESSAGE_INCLUDE
}>

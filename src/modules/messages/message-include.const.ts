import { Prisma } from '../../generated/prisma/client'

/**
 * Единый include для всех выборок сообщений (getAll, окно, прыжки к сообщению).
 * Держим в одном месте, чтобы окно и обычная пагинация возвращали одинаковую форму.
 */
export const MESSAGE_INCLUDE = {
	readReceipts: {
		select: {
			userId: true,
			readAt: true,
			user: { select: { firstName: true, lastName: true } }
		}
	},
	attachments: { include: { file: true } },
	systemEvent: { select: { eventType: true } },
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

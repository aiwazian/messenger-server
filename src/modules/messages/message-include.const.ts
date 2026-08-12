import { Prisma } from '../../generated/prisma/client'

/**
 * Единый include для всех выборок сообщений (getAll, окно, прыжки к сообщению).
 * Держим в одном месте, чтобы окно и обычная пагинация возвращали одинаковую форму.
 *
 * Отметок о прочтении здесь нет: «кто и когда прочитал» живёт трое суток в Redis
 * (MessageReadsStore), а сам статус считается по курсору в ChatReadState. Раньше к каждому
 * сообщению страницы подтягивался join с отметками и именами читателей, хотя список
 * просмотров нужен только автору сообщения.
 */
export const MESSAGE_INCLUDE = {
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

import { Injectable, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { ChatType } from '../../../common/enums/chat-type.enum'
import { detectChatType } from '../../../common/utils/detect-chat-type.util'
import { Prisma } from '../../../generated/prisma/client'
import { MessagesService } from '../messages.service'
import { MESSAGE_INCLUDE, MessageWithRelations } from '../message-include.const'
import { GetMessagesWindowDto } from '../dto/get-messages-window.dto'
import { MessagesWindowResponseDto } from '../dto/messages-window-response.dto'
import { ChatReadStateService } from '../../chat-read-state/chat-read-state.service'
import { ChatReadStateDto } from '../../chat-read-state/dto/chat-read-state.dto'

/**
 * Загрузка «окна» истории чата.
 *
 * Курсор — Message.id (autoincrement), поэтому порядок по id совпадает с порядком отправки
 * и не ломается при одинаковых sendTime. offset-пагинация для прыжков не годится:
 * при вставке новых сообщений все offset’ы съезжают.
 */
@Injectable()
export class GetMessagesWindowUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly messagesService: MessagesService,
		private readonly chatReadState: ChatReadStateService
	) { }

	async execute(
		userId: UserId,
		chatId: ChatId,
		dto: GetMessagesWindowDto
	): Promise<MessagesWindowResponseDto> {
		const chatType = detectChatType(chatId)
		const baseWhere = this.messagesService.buildChatMessagesWhere(userId, chatId)
		const readState = await this.chatReadState.getState(userId, chatId)

		const window = await this.loadWindow(userId, dto, baseWhere, chatType, readState)

		window.unreadCount = readState.unreadCount
		window.firstUnreadMessageId = readState.firstUnreadMessageId

		return window
	}

	private async loadWindow(
		userId: UserId,
		dto: GetMessagesWindowDto,
		baseWhere: Prisma.MessageWhereInput,
		chatType: ChatType,
		readState: ChatReadStateDto
	): Promise<MessagesWindowResponseDto> {
		if (dto.anchor === 'first_unread') {
			const anchorId = await this.resolveFirstUnreadAnchor(baseWhere, readState)

			return anchorId
				? this.around(baseWhere, anchorId, dto.limit, userId, chatType)
				: this.before(baseWhere, undefined, dto.limit, userId, chatType)
		}

		if (dto.anchorId) {
			return this.around(baseWhere, BigInt(dto.anchorId), dto.limit, userId, chatType)
		}

		if (dto.afterId) {
			return this.after(baseWhere, BigInt(dto.afterId), dto.limit, userId, chatType)
		}

		const beforeId = dto.beforeId ? BigInt(dto.beforeId) : undefined
		return this.before(baseWhere, beforeId, dto.limit, userId, chatType)
	}

	/**
	 * Первое непрочитанное могло быть удалено или скрыто лично для пользователя.
	 * Тогда around бросил бы 404 и чат вообще не открылся — проверяем видимость заранее.
	 */
	private async resolveFirstUnreadAnchor(
		baseWhere: Prisma.MessageWhereInput,
		readState: ChatReadStateDto
	): Promise<bigint | null> {
		if (!readState.firstUnreadMessageId || readState.unreadCount === 0) return null

		const anchorId = BigInt(readState.firstUnreadMessageId)
		const visible = await this.prisma.message.count({
			where: { AND: [baseWhere, { id: anchorId }] }
		})

		return visible > 0 ? anchorId : null
	}

	/** Окно вокруг якоря: limit старше + сам якорь + limit новее. */
	private async around(
		baseWhere: Prisma.MessageWhereInput,
		anchorId: bigint,
		limit: number,
		userId: UserId,
		chatType: ChatType
	): Promise<MessagesWindowResponseDto> {
		const anchor = await this.prisma.message.findFirst({
			where: { AND: [baseWhere, { id: anchorId }] },
			select: { id: true }
		})

		if (!anchor) throw new NotFoundException('Anchor message not found')

		const [olderDesc, anchorAndNewer] = await Promise.all([
			this.prisma.message.findMany({
				where: { AND: [baseWhere, { id: { lt: anchorId } }] },
				include: MESSAGE_INCLUDE,
				orderBy: { id: 'desc' },
				take: limit + 1
			}),
			this.prisma.message.findMany({
				where: { AND: [baseWhere, { id: { gte: anchorId } }] },
				include: MESSAGE_INCLUDE,
				orderBy: { id: 'asc' },
				take: limit + 1
			})
		])

		return this.toResponse(
			[...olderDesc.slice(0, limit).reverse(), ...anchorAndNewer.slice(0, limit)],
			olderDesc.length > limit,
			anchorAndNewer.length > limit,
			userId,
			chatType
		)
	}

	/** Страница старше курсора. Без курсора — самые свежие сообщения чата. */
	private async before(
		baseWhere: Prisma.MessageWhereInput,
		beforeId: bigint | undefined,
		limit: number,
		userId: UserId,
		chatType: ChatType
	): Promise<MessagesWindowResponseDto> {
		const rows = await this.prisma.message.findMany({
			where: beforeId ? { AND: [baseWhere, { id: { lt: beforeId } }] } : baseWhere,
			include: MESSAGE_INCLUDE,
			orderBy: { id: 'desc' },
			take: limit + 1
		})

		return this.toResponse(
			rows.slice(0, limit).reverse(),
			rows.length > limit,
			Boolean(beforeId),
			userId,
			chatType
		)
	}

	/** Страница новее курсора. */
	private async after(
		baseWhere: Prisma.MessageWhereInput,
		afterId: bigint,
		limit: number,
		userId: UserId,
		chatType: ChatType
	): Promise<MessagesWindowResponseDto> {
		const rows = await this.prisma.message.findMany({
			where: { AND: [baseWhere, { id: { gt: afterId } }] },
			include: MESSAGE_INCLUDE,
			orderBy: { id: 'asc' },
			take: limit + 1
		})

		return this.toResponse(rows.slice(0, limit), true, rows.length > limit, userId, chatType)
	}

	private async toResponse(
		messages: MessageWithRelations[],
		hasMoreBefore: boolean,
		hasMoreAfter: boolean,
		userId: UserId,
		chatType: ChatType
	): Promise<MessagesWindowResponseDto> {
		const sources = await this.messagesService.resolveSources(userId, messages)

		return plainToInstance(MessagesWindowResponseDto, {
			messages: messages.map((message) =>
				this.messagesService.mapMessageToDto(message, userId, chatType, sources)
			),
			hasMoreBefore,
			hasMoreAfter
		})
	}
}

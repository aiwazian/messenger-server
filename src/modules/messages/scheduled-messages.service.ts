import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { MessagesService } from './messages.service'
import { MESSAGE_INCLUDE } from './message-include.const'
import { MessageResponseDto } from './dto/message-response.dto'
import { UpdateScheduledMessageDto } from './dto/update-scheduled-message.dto'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SocketEvent } from '../../common/socket/socket-events'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { resolveScheduledTime } from './scheduled-message.util'

const PUBLISH_BATCH_SIZE = 25
const PUBLISH_INTERVAL_MS = 1000

@Injectable()
export class ScheduledMessagesService {
	private readonly logger = new Logger(ScheduledMessagesService.name)
	private isPublishing = false

	constructor(
		private readonly prisma: PrismaService,
		private readonly messagesService: MessagesService,
		private readonly realtimeGateway: RealtimeGateway
	) {}

	@Interval(PUBLISH_INTERVAL_MS)
	async publishDueMessages(): Promise<void> {
		if (this.isPublishing) return

		this.isPublishing = true

		try {
			const now = BigInt(Date.now())
			const due = await this.prisma.message.findMany({
				where: { scheduledAt: { not: null, lte: now } },
				select: { id: true },
				orderBy: { scheduledAt: 'asc' },
				take: PUBLISH_BATCH_SIZE
			})

			for (const message of due) {
				try {
					await this.publishMessage(message.id)
				} catch (error) {
					this.logger.error(
						`Failed to publish scheduled message ${message.id}: ${String(error)}`
					)
				}
			}
		} finally {
			this.isPublishing = false
		}
	}

	async getScheduledMessages(userId: UserId, chatId: ChatId): Promise<MessageResponseDto[]> {
		const chatType = detectChatType(chatId)

		const messages = await this.prisma.message.findMany({
			where: {
				...this.buildScheduledWhere(userId, chatId),
				scheduledAt: { not: null }
			},
			include: MESSAGE_INCLUDE,
			orderBy: { scheduledAt: 'asc' }
		})

		const sources = await this.messagesService.resolveSources(userId, messages)

		return messages.map((message) =>
			this.messagesService.mapMessageToDto(message, userId, chatType, sources)
		)
	}

	async updateScheduledMessage(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		dto: UpdateScheduledMessageDto,
		excludeSocketId: string
	): Promise<MessageResponseDto> {
		const scheduledAt = resolveScheduledTime(dto.scheduledAt)

		if (scheduledAt == null) {
			throw new BadRequestException('Scheduled time is required')
		}

		const message = await this.prisma.message.update({
			where: { id: messageId },
			data: { scheduledAt, sendTime: scheduledAt },
			include: MESSAGE_INCLUDE
		})

		const chatType = detectChatType(chatId)
		const sources = await this.messagesService.resolveSources(userId, [message])
		const messageInstance = this.messagesService.mapMessageToDto(
			message,
			userId,
			chatType,
			sources
		)

		this.messagesService.notifyScheduled(userId, chatId, excludeSocketId)

		return messageInstance
	}

	async deleteScheduledMessage(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		excludeSocketId: string
	): Promise<void> {
		await this.messagesService.hardDeleteMessage(messageId)
		this.messagesService.notifyScheduled(userId, chatId, excludeSocketId)
	}

	async sendScheduledNow(
		userId: UserId,
		chatId: ChatId,
		messageId: number
	): Promise<MessageResponseDto> {
		const messageInstance = await this.publishMessage(BigInt(messageId))

		if (!messageInstance) {
			throw new NotFoundException('Scheduled message not found')
		}

		return messageInstance
	}

	private async publishMessage(messageId: bigint): Promise<MessageResponseDto | null> {
		const claimed = await this.prisma.message.updateMany({
			where: { id: messageId, scheduledAt: { not: null } },
			data: { scheduledAt: null, sendTime: Date.now() }
		})

		if (claimed.count === 0) return null

		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			include: MESSAGE_INCLUDE
		})

		if (!message) return null

		const chatId = ChatId(message.chatId.toString())
		const chatType = detectChatType(chatId)
		const senderId = UserId(message.senderId.toString())
		const sources = await this.messagesService.resolveSources(senderId, [message])
		const messageInstance = this.messagesService.mapMessageToDto(
			message,
			senderId,
			chatType,
			sources
		)

		await this.messagesService.notifyRecipients(senderId, chatId, messageInstance)
		this.messagesService.notifyScheduled(senderId, chatId)

		if (BigInt(chatId) !== BigInt(senderId)) {
			this.realtimeGateway.sendToUsersExceptChat(
				[senderId],
				chatId,
				SocketEvent.MESSAGE_NEW,
				messageInstance
			)
		}

		return messageInstance
	}

	private buildScheduledWhere(
		userId: UserId,
		chatId: ChatId
	): { senderId: UserId; chatId: ChatId } {
		return { senderId: userId, chatId: chatId }
	}
}

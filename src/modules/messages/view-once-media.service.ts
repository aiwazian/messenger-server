import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
	OnModuleInit
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { MessagesService } from './messages.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SocketEvent } from '../../common/socket/socket-events'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { ChatId } from '../../common/types/chat-id.type'
import { UserId } from '../../common/types/user-id.type'

export interface MarkViewOnceResult {
	deleteAt: number | null
	viewOnceSeconds: number | null
	alreadyOpened: boolean
}

const SWEEP_BATCH_SIZE = 100

@Injectable()
export class ViewOnceMediaService implements OnModuleInit {
	private readonly logger = new Logger(ViewOnceMediaService.name)
	private isSweeping = false

	constructor(
		private readonly prisma: PrismaService,
		private readonly messagesService: MessagesService,
		private readonly realtimeGateway: RealtimeGateway
	) {}

	async onModuleInit(): Promise<void> {
		await this.sweep()
	}

	async markViewed(
		userId: UserId,
		chatId: ChatId,
		messageId: number,
		fileId: string
	): Promise<MarkViewOnceResult> {
		const chatType = detectChatType(chatId)
		const isSavedMessages = BigInt(chatId) === BigInt(userId)

		if (chatType !== ChatType.PRIVATE || isSavedMessages) {
			throw new BadRequestException('View-once media is only available in private chats')
		}

		const message = await this.prisma.message.findFirst({
			where: {
				AND: [
					this.messagesService.buildChatMessagesWhere(userId, chatId),
					{ id: BigInt(messageId) }
				]
			},
			select: {
				id: true,
				senderId: true,
				attachments: {
					where: { fileId },
					select: {
						id: true,
						viewOnce: true,
						viewOnceSeconds: true,
						viewOnceDeleteAt: true
					}
				}
			}
		})

		if (!message) throw new NotFoundException('Message not found')

		const attachment = message.attachments[0]
		if (!attachment?.viewOnce) throw new NotFoundException('View-once attachment not found')

		if (BigInt(message.senderId) === BigInt(userId)) {
			return {
				deleteAt: attachment.viewOnceDeleteAt ? Number(attachment.viewOnceDeleteAt) : null,
				viewOnceSeconds: attachment.viewOnceSeconds,
				alreadyOpened: attachment.viewOnceDeleteAt !== null
			}
		}

		const deleteAt = BigInt(Date.now() + (attachment.viewOnceSeconds ?? 0) * 1000)
		const claimed = await this.prisma.messageAttachment.updateMany({
			where: { id: attachment.id, viewOnceDeleteAt: null },
			data: { viewOnceDeleteAt: deleteAt }
		})

		if (claimed.count > 0) {
			if (attachment.viewOnceSeconds === null) {
				try {
					await this.deleteAndNotify(BigInt(messageId), fileId)
				} catch (error) {
					this.logger.error(`Failed to delete one-view attachment ${fileId}: ${String(error)}`)
				}
			}

			return {
				deleteAt: Number(deleteAt),
				viewOnceSeconds: attachment.viewOnceSeconds,
				alreadyOpened: false
			}
		}

		const current = await this.prisma.messageAttachment.findUnique({
			where: { id: attachment.id },
			select: { viewOnceDeleteAt: true }
		})

		if (!current?.viewOnceDeleteAt) {
			throw new NotFoundException('View-once attachment not found')
		}

		return {
			deleteAt: Number(current.viewOnceDeleteAt),
			viewOnceSeconds: attachment.viewOnceSeconds,
			alreadyOpened: true
		}
	}

	@Interval(1000)
	async sweep(): Promise<void> {
		if (this.isSweeping) return

		this.isSweeping = true

		try {
			const now = BigInt(Date.now())
			const due = await this.prisma.messageAttachment.findMany({
				where: { viewOnceDeleteAt: { not: null, lte: now } },
				select: { messageId: true, fileId: true },
				orderBy: { viewOnceDeleteAt: 'asc' },
				take: SWEEP_BATCH_SIZE
			})

			for (const attachment of due) {
				try {
					await this.deleteAndNotify(attachment.messageId, attachment.fileId)
				} catch (error) {
					this.logger.error(
						`Failed to delete view-once attachment ${attachment.fileId}: ${String(error)}`
					)
				}
			}
		} finally {
			this.isSweeping = false
		}
	}

	private async deleteAndNotify(messageId: bigint, fileId: string): Promise<void> {
		const result = await this.messagesService.deleteViewOnceAttachment(messageId, fileId)
		if (!result) return

		const payload = {
			chatId: result.chatId,
			messageId,
			fileId,
			messageDeleted: result.messageDeleted
		}
		const participants = new Set([result.senderId.toString(), result.chatId.toString()])

		for (const participant of participants) {
			this.realtimeGateway.sendToUser(
				UserId(participant),
				SocketEvent.MESSAGE_ATTACHMENT_DELETED,
				payload
			)
		}
	}
}

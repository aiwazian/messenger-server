import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { MessagesService } from '../../messages/messages.service'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { detectChatType } from '../../../common/utils/detect-chat-type.util'
import { ChatType } from '../../../common/enums/chat-type.enum'
import { SystemEventType } from '../../../generated/prisma/enums'

@Injectable()
export class DeleteChatUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly messagesService: MessagesService
	) {}

	async run(
		userId: UserId,
		chatId: ChatId,
		deleteForRecipient: boolean = false
	): Promise<void> {
		const chatType = detectChatType(chatId)
		const isPrivateChat = chatType === ChatType.PRIVATE

		await this.prisma.chat.deleteMany({
			where: { userId, chatId }
		})

		if (isPrivateChat) {
			if (deleteForRecipient) {
				await this.prisma.chat.deleteMany({
					where: { userId: chatId, chatId: userId }
				})
			}

			await this.messagesService.clearHistory(userId, chatId, deleteForRecipient)

			if (deleteForRecipient) {
				await this.removeClearedMarker(chatId)
			}

			return
		}

		const canWipe = await this.isHistoryOwner(chatType, chatId, userId)
		if (!canWipe) return

		await this.messagesService.clearHistory(userId, chatId, false)
		await this.removeClearedMarker(chatId)
	}

	private async isHistoryOwner(
		chatType: ChatType,
		chatId: ChatId,
		userId: UserId
	): Promise<boolean> {
		if (chatType === ChatType.GROUP) {
			const group = await this.prisma.group.findFirst({
				where: { id: chatId, ownerId: userId },
				select: { id: true }
			})
			return group != null
		}

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findFirst({
				where: { id: chatId, ownerId: userId },
				select: { id: true }
			})
			return channel != null
		}

		return false
	}

	private async removeClearedMarker(chatId: ChatId): Promise<void> {
		await this.prisma.message.deleteMany({
			where: {
				chatId: chatId,
				systemEvent: { eventType: SystemEventType.HISTORY_CLEARED }
			}
		})
	}
}

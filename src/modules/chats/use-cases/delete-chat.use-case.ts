import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { MessagesService } from '../../messages/messages.service'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { detectChatType } from '../../../common/utils/detect-chat-type.util'
import { ChatType } from '../../../common/enums/chat-type.enum'
import { SystemEventType } from '../../../../generated/prisma/enums'

@Injectable()
export class DeleteChatUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly messagesService: MessagesService
	) {}

	async execute(
		userId: UserId,
		chatId: ChatId,
		deleteForRecipient: boolean = false
	): Promise<void> {
		const chatType = detectChatType(chatId)
		const isPrivateChat = chatType === ChatType.PRIVATE

		await this.prisma.chat.deleteMany({
			where: { userId, chatId }
		})

		if (isPrivateChat && deleteForRecipient) {
			await this.prisma.chat.deleteMany({
				where: { userId: chatId, chatId: userId }
			})
		}

		await this.messagesService.clearHistory(userId, chatId, deleteForRecipient)

		// Also delete the HISTORY_CLEARED message that was just created if any,
		// because the chat is being deleted.
		if (!isPrivateChat || deleteForRecipient) {
			await this.prisma.message.deleteMany({
				where: {
					chatId: chatId,
					systemEvent: { eventType: SystemEventType.HISTORY_CLEARED }
				}
			})
		}
	}
}

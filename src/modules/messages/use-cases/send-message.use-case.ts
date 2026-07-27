import { Injectable, NotFoundException } from '@nestjs/common'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { TextMessageDto } from '../dto/text-message.dto'
import { MessageResponseDto } from '../dto/message-response.dto'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { EncryptionService } from '../../encryption/encryption.service'
import { MessageType } from '../../../generated/prisma/enums'
import { detectChatType } from '../../../common/utils/detect-chat-type.util'
import { ChatType } from '../../../common/enums/chat-type.enum'
import { ChatsService } from '../../chats/chats.service'
import { MessagesService } from '../messages.service'
import { MESSAGE_INCLUDE } from '../message-include.const'

@Injectable()
export class SendMessageUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		private readonly chatsService: ChatsService,
		private readonly messageService: MessagesService
	) { }

	async execute(
		senderId: UserId,
		chatId: ChatId,
		dto: TextMessageDto,
		excludeSocketId: string
	): Promise<MessageResponseDto> {
		await this.chatsService.create(senderId, chatId)
		const { encrypted, version } = this.encryption.encrypt(dto.text)
		const replyTarget = await this.resolveReplyTarget(senderId, chatId, dto.replyToId)
		const sequenceId = await this.prisma.message.count({
			where: {
				OR: [
					{ chatId: chatId, senderId: senderId },
					{ chatId: senderId, senderId: chatId }
				]
			}
		})

		const chatType = detectChatType(chatId)

		const message = await this.prisma.message.create({
			data: {
				sequenceId: sequenceId + 1,
				chatId: chatId,
				text: encrypted,
				sendTime: Date.now(),
				senderId: senderId,
				messageType: MessageType.TEXT,
				encryptionKeyVersion: version,
				replyToId: replyTarget?.id ?? null,
				replyToChatId: replyTarget ? chatId : null
			},
			include: MESSAGE_INCLUDE
		})

		const sources = await this.messageService.resolveSources(senderId, [message])
		const messageInstance = this.messageService.mapMessageToDto(
			message,
			senderId,
			chatType,
			sources
		)
		if (chatType === ChatType.PRIVATE) messageInstance.isRead = true

		this.messageService.notifyRecipients(senderId, chatId, messageInstance, excludeSocketId)

		return messageInstance
	}

	/**
	 * Проверяет, что цитируемое сообщение видимо в этом же чате.
	 *
	 * Без проверки клиент мог бы прислать любой id и вытащить текст чужого сообщения
	 * через replyTo-превью.
	 */
	private async resolveReplyTarget(
		senderId: UserId,
		chatId: ChatId,
		rawReplyToId?: string
	): Promise<{ id: bigint } | undefined> {
		if (!rawReplyToId) return undefined

		const target = await this.prisma.message.findFirst({
			where: {
				AND: [
					this.messageService.buildChatMessagesWhere(senderId, chatId),
					{ id: BigInt(rawReplyToId) }
				]
			},
			select: { id: true }
		})

		if (!target) throw new NotFoundException('Reply target not found')

		return target
	}
}

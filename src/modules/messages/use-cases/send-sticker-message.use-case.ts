import { Injectable, NotFoundException } from '@nestjs/common'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { StickerMessageDto } from '../dto/sticker-message.dto'
import { MessageResponseDto } from '../dto/message-response.dto'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { EncryptionService } from '../../encryption/encryption.service'
import { MessageType } from '../../../generated/prisma/enums'
import { detectChatType } from '../../../common/utils/detect-chat-type.util'
import { ChatsService } from '../../chats/chats.service'
import { MessagesService } from '../messages.service'
import { MESSAGE_INCLUDE } from '../message-include.const'

@Injectable()
export class SendStickerMessageUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		private readonly chatsService: ChatsService,
		private readonly messageService: MessagesService
	) {}

	async execute(
		senderId: UserId,
		chatId: ChatId,
		dto: StickerMessageDto,
		excludeSocketId: string
	): Promise<MessageResponseDto> {
		await this.chatsService.create(senderId, chatId)

		const sticker = await this.prisma.sticker.findUnique({
			where: { id: BigInt(dto.stickerId) },
			select: { id: true }
		})

		if (!sticker) throw new NotFoundException('Sticker not found')

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
				text: null,
				sendTime: Date.now(),
				senderId: senderId,
				messageType: MessageType.STICKER,
				encryptionKeyVersion: this.encryption.currentVersion,
				stickerId: sticker.id,
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

		messageInstance.isRead = false

		this.messageService.notifyRecipients(senderId, chatId, messageInstance, excludeSocketId)

		return messageInstance
	}

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

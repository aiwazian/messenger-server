import { Injectable } from '@nestjs/common'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { TextMessageDto } from '../dto/text-message.dto'
import { MessageResponseDto } from '../dto/message-response.dto'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { EncryptionService } from '../../encryption/encryption.service'
import { plainToInstance } from 'class-transformer'
import { MessageType } from '../../../../generated/prisma/enums'
import { detectChatType } from '../../../common/utils/detect-chat-type.util'
import { ChatType } from '../../../common/enums/chat-type.enum'
import { ChatsService } from '../../chats/chats.service'
import { MessagesService } from '../messages.service'

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
				encryptionKeyVersion: version
			}
		})

		const messageInstance = plainToInstance(MessageResponseDto, {
			...message,
			text: dto.text,
			isRead: true,
			senderId: chatType === ChatType.CHANNEL ? message.chatId : message.senderId,
			messageType: MessageType.TEXT
		})

		this.messageService.notifyRecipients(senderId, chatId, messageInstance, excludeSocketId)

		return messageInstance
	}
}

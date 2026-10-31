import { BadRequestException, Injectable } from '@nestjs/common'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { ContactMessageDto } from '../dto/contact-message.dto'
import { MessageResponseDto } from '../dto/message-response.dto'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { EncryptionService } from '../../encryption/encryption.service'
import { MessageType } from '../../../generated/prisma/enums'
import { detectChatType } from '../../../common/utils/detect-chat-type.util'
import { ChatsService } from '../../chats/chats.service'
import { MessagesService } from '../messages.service'
import { MESSAGE_INCLUDE } from '../message-include.const'
import { resolveScheduledTime } from '../scheduled-message.util'

interface SanitizedContact {
	name: string
	phones: string[]
	emails: string[]
	urls: string[]
	addresses: string[]
	organization: string | null
	jobTitle: string | null
	birthday: string | null
}

@Injectable()
export class SendContactMessageUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		private readonly chatsService: ChatsService,
		private readonly messageService: MessagesService
	) {}

	async send(
		senderId: UserId,
		chatId: ChatId,
		dto: ContactMessageDto,
		excludeSocketId: string
	): Promise<MessageResponseDto> {
		await this.chatsService.create(senderId, chatId)

		const sanitizedContact = this.sanitizeContact(dto)

		const scheduledTime = resolveScheduledTime(dto.scheduledAt)

		const sequenceId = await this.prisma.message.count({
			where: {
				OR: [
					{ chatId: chatId, senderId: senderId },
					{ chatId: senderId, senderId: chatId }
				]
			}
		})

		const chatType = detectChatType(chatId)

		const contact = await this.prisma.messageContact.create({ data: sanitizedContact })

		const message = await this.prisma.message.create({
			data: {
				sequenceId: sequenceId + 1,
				chatId: chatId,
				text: null,
				sendTime: scheduledTime ?? Date.now(),
				scheduledAt: scheduledTime,
				senderId: senderId,
				messageType: MessageType.CONTACT,
				encryptionKeyVersion: this.encryption.currentVersion,
				contactId: contact.id
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

		if (scheduledTime != null) {
			this.messageService.notifyScheduled(senderId, chatId, excludeSocketId)
		} else {
			this.messageService.notifyRecipients(senderId, chatId, messageInstance, excludeSocketId, dto.silent === true)
		}

		return messageInstance
	}

	private sanitizeContact(dto: ContactMessageDto): SanitizedContact {
		const name = dto.name.trim()

		if (!name) {
			throw new BadRequestException('Contact name must not be empty')
		}

		const phones = sanitizeValues(dto.phones)
			.map((phone) => phone.replace(/[ -]/g, ''))
			.filter((phone) => phone.length > 0)

		if (phones.length === 0) {
			throw new BadRequestException('Contact must have at least one phone number')
		}

		return {
			name,
			phones,
			emails: sanitizeValues(dto.emails),
			urls: sanitizeValues(dto.urls),
			addresses: sanitizeValues(dto.addresses),
			organization: sanitizeValue(dto.organization),
			jobTitle: sanitizeValue(dto.jobTitle),
			birthday: sanitizeValue(dto.birthday)
		}
	}
}

function sanitizeValues(values?: string[]): string[] {
	return (values ?? [])
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
}

function sanitizeValue(value?: string): string | null {
	const trimmed = value?.trim()

	return trimmed ? trimmed : null
}

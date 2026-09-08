import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { EncryptionService } from '../../encryption/encryption.service'
import { ChatsService } from '../../chats/chats.service'
import { MessagesService } from '../messages.service'
import { ChatSourceResolver } from '../chat-source.resolver'
import { UserId } from '../../../common/types/user-id.type'
import { ChatId } from '../../../common/types/chat-id.type'
import { ChatType } from '../../../common/enums/chat-type.enum'
import { detectChatType } from '../../../common/utils/detect-chat-type.util'
import { MessageType } from '../../../generated/prisma/enums'
import { MESSAGE_INCLUDE } from '../message-include.const'
import { MessageResponseDto } from '../dto/message-response.dto'
import { ForwardMessageDto } from '../dto/forward-message.dto'

@Injectable()
export class ForwardMessageUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		private readonly chatsService: ChatsService,
		private readonly messagesService: MessagesService,
		private readonly chatSourceResolver: ChatSourceResolver
	) {}

	async execute(
		userId: UserId,
		sourceChatId: ChatId,
		messageId: number,
		dto: ForwardMessageDto,
		excludeSocketId: string
	): Promise<MessageResponseDto[]> {
		const source = await this.prisma.message.findFirst({
			where: {
				AND: [this.messagesService.buildChatMessagesWhere(userId, sourceChatId), { id: messageId }]
			},
			include: MESSAGE_INCLUDE
		})

		if (!source) throw new NotFoundException('Message not found')
		if (source.messageType === MessageType.SYSTEM) {
			throw new ForbiddenException('System messages cannot be forwarded')
		}

		const originChatId = this.resolveOriginChatId(source)
		const plainText = this.messagesService.decryptText(source.text, source.encryptionKeyVersion)

		const targetIds = Array.from(new Set(dto.targetChatIds)).map((id) => ChatId(id))
		const results: MessageResponseDto[] = []

		for (const targetChatId of targetIds) {
			await this.assertCanSend(userId, targetChatId)
			results.push(
				await this.copyToChat(
					userId,
					targetChatId,
					source,
					originChatId,
					plainText,
					excludeSocketId
				)
			)
		}

		return results
	}

	private resolveOriginChatId(source: {
		chatId: bigint
		senderId: bigint
		forwardedFromChatId: bigint | null
	}): bigint {
		if (source.forwardedFromChatId) return source.forwardedFromChatId

		return detectChatType(ChatId(source.chatId)) === ChatType.PRIVATE
			? source.senderId
			: source.chatId
	}

	private async assertCanSend(userId: UserId, targetChatId: ChatId): Promise<void> {
		const chatType = detectChatType(targetChatId)

		if (chatType === ChatType.PRIVATE) {
			const blocked = await this.prisma.userBlackList.findFirst({
				where: {
					OR: [
						{ blockerId: userId, blockedId: targetChatId },
						{ blockerId: targetChatId, blockedId: userId }
					]
				},
				select: { id: true }
			})

			if (blocked) {
				throw new ForbiddenException('Sending messages is restricted due to blocking')
			}

			const exists = await this.prisma.user.count({ where: { id: targetChatId } })
			if (exists === 0) throw new NotFoundException('User not found')
			return
		}

		if (chatType === ChatType.GROUP) {
			const member = await this.prisma.groupMember.findFirst({
				where: { groupId: targetChatId, userId },
				select: { id: true }
			})
			if (!member) throw new ForbiddenException('User is not a group member')
			return
		}

		if (chatType === ChatType.CHANNEL) {
			const owner = await this.prisma.channel.findFirst({
				where: { id: targetChatId, ownerId: userId },
				select: { id: true }
			})
			if (!owner) throw new ForbiddenException('Only channel admins can write')
			return
		}

		throw new ForbiddenException('Unsupported chat type')
	}

	private async copyToChat(
		userId: UserId,
		targetChatId: ChatId,
		source: {
			messageType: MessageType
			stickerId: bigint | null
			attachments: Array<{ fileId: string; type: any; sortOrder: number }>
		},
		originChatId: bigint,
		plainText: string | null,
		excludeSocketId: string
	): Promise<MessageResponseDto> {
		await this.chatsService.create(userId, targetChatId)

		const encryptedText = plainText ? this.encryption.encrypt(plainText) : null

		const sequenceId = await this.prisma.message.count({
			where: {
				OR: [
					{ chatId: targetChatId, senderId: userId },
					{ chatId: userId, senderId: targetChatId }
				]
			}
		})

		const created = await this.prisma.message.create({
			data: {
				sequenceId: sequenceId + 1,
				chatId: targetChatId,
				senderId: userId,
				text: encryptedText?.encrypted ?? null,
				sendTime: Date.now(),
				messageType: source.messageType,
				stickerId: source.stickerId,
				encryptionKeyVersion: encryptedText?.version ?? this.encryption.currentVersion,
				forwardedFromChatId: originChatId,
				attachments: {
					createMany: {
						data: source.attachments.map((attachment) => ({
							fileId: attachment.fileId,
							type: attachment.type,
							sortOrder: attachment.sortOrder
						}))
					}
				}
			},
			include: MESSAGE_INCLUDE
		})

		const chatType = detectChatType(targetChatId)
		const sources = await this.chatSourceResolver.resolve(userId, [originChatId])
		const dto = this.messagesService.mapMessageToDto(created, userId, chatType, sources)

		this.messagesService.notifyRecipients(userId, targetChatId, dto, excludeSocketId)

		return dto
	}
}

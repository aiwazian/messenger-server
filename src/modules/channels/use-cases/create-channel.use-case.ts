import { Injectable } from '@nestjs/common'
import { generateChannelId } from '../../../common/utils/id-generator.util'
import { UserId } from '../../../common/types/user-id.type'
import { CreateChannelDto } from '../dto/create-channel.dto'
import { ChannelResponseDto } from '../dto/channel.dto'
import { ChannelType, MessageType, SystemEventType } from '../../../../generated/prisma/enums'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { RealtimeGateway } from '../../realtime/realtime.gateway'
import { EncryptionService } from '../../encryption/encryption.service'
import { ChatsService } from '../../chats/chats.service'
import { ChatId } from '../../../common/types/chat-id.type'
import { plainToInstance } from 'class-transformer'
import { ChatResponseDto } from '../../chats/dto/chat-response.dto'
import { SocketEvent } from '../../../common/socket/socket-events'

@Injectable()
export class CreateChannelUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly encryption: EncryptionService
	) {}

	async execute(ownerId: UserId, dto: CreateChannelDto): Promise<ChannelResponseDto> {
		const channelId = generateChannelId()

		const channel = await this.prisma.channel.create({
			data: {
				id: channelId,
				name: dto.name,
				bio: dto.bio,
				ownerId: ownerId,
				channelType: ChannelType.PRIVATE,
				username: null,
				subscribers: {
					create: {
						userId: ownerId
					}
				}
			}
		})

		await this.chatsService.create(ownerId, ChatId(channel.id))

		await this.prisma.message.create({
			data: {
				chatId: channel.id,
				text: null,
				sendTime: Date.now(),
				sequenceId: BigInt(Date.now()),
				senderId: ownerId,
				messageType: MessageType.SYSTEM,
				encryptionKeyVersion: this.encryption.currentVersion,
				systemEvent: {
					create: {
						eventType: SystemEventType.CHANNEL_CREATED
					}
				}
			}
		})

		const chatPayload = plainToInstance(ChatResponseDto, {
			id: channel.id,
			name: channel.name,
			isPinned: false,
			lastMessage: null
		})

		this.realtimeGateway.sendToUser(ownerId, SocketEvent.CHAT_NEW, chatPayload)

		return plainToInstance(ChannelResponseDto, {
			...channel,
			isSubscribed: true,
			isOwner: true,
			subscribers: 1
		})
	}
}

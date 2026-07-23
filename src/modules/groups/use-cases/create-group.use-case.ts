import { plainToInstance } from 'class-transformer'
import { GroupType, MessageType, SystemEventType } from '../../../generated/prisma/enums'
import { ChatId } from '../../../common/types/chat-id.type'
import { UserId } from '../../../common/types/user-id.type'
import { generateGroupId } from '../../../common/utils/id-generator.util'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { ChatsService } from '../../chats/chats.service'
import { EncryptionService } from '../../encryption/encryption.service'
import { RealtimeGateway } from '../../realtime/realtime.gateway'
import { CreateGroupDto } from '../dto/create-group.dto'
import { GroupResponseDto } from '../dto/group-response.dto'
import { ChatResponseDto } from '../../chats/dto/chat-response.dto'
import { SocketEvent } from '../../../common/socket/socket-events'
import { Injectable } from '@nestjs/common'

@Injectable()
export class CreateGroupUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly encryption: EncryptionService
	) {}

	async execute(ownerId: UserId, dto: CreateGroupDto): Promise<GroupResponseDto> {
		const groupId = generateGroupId()

		const group = await this.prisma.group.create({
			data: {
				id: groupId,
				name: dto.name,
				bio: dto.bio,
				ownerId: ownerId,
				groupType: GroupType.PRIVATE,
				username: null,
				members: {
					create: {
						userId: ownerId
					}
				}
			}
		})

		await this.chatsService.create(ownerId, ChatId(group.id))

		await this.prisma.message.create({
			data: {
				chatId: group.id,
				text: null,
				sendTime: Date.now(),
				sequenceId: BigInt(Date.now()),
				senderId: ownerId,
				messageType: MessageType.SYSTEM,
				encryptionKeyVersion: this.encryption.currentVersion,
				systemEvent: {
					create: {
						eventType: SystemEventType.GROUP_CREATED
					}
				}
			}
		})

		const chatPayload = plainToInstance(ChatResponseDto, {
			id: group.id,
			name: group.name,
			isPinned: false,
			lastMessage: null
		})

		this.realtimeGateway.sendToUser(ownerId, SocketEvent.CHAT_NEW, chatPayload)

		return plainToInstance(GroupResponseDto, {
			...group,
			isMember: true,
			isOwner: true,
			membersCount: 1
		})
	}
}

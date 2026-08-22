import {
	ForbiddenException,
	forwardRef,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { ChatResponseDto } from './dto/chat-response.dto'
import { plainToInstance } from 'class-transformer'
import { MessageAttachmentDto, MessageResponseDto } from '../messages/dto/message-response.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { EncryptionService } from '../encryption/encryption.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SocketEvent } from '../../common/socket/socket-events'
import { ChannelType, GroupType } from '../../generated/prisma/enums'
import { ChatReadStateService } from '../chat-read-state/chat-read-state.service'
import { ChatReadStateDto } from '../chat-read-state/dto/chat-read-state.dto'
import { NotificationSettingsService } from '../notification-settings/notification-settings.service'

@Injectable()
export class ChatsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		@Inject(forwardRef(() => RealtimeGateway))
		private readonly realtimeGateway: RealtimeGateway,
		private readonly chatReadState: ChatReadStateService,
		private readonly notificationSettings: NotificationSettingsService
	) {}

	async getAll(userId: UserId): Promise<ChatResponseDto[]> {
		const chats = await this.prisma.chat.findMany({
			where: { userId }
		})

		if (chats.length === 0) {
			return []
		}

		/*
		 * Непрочитанные и выключенные чаты считаются одним заходом на весь список, как
		 * и раньше с ChatReadState: поиск исключения на каждую карточку дал бы запрос
		 * на чат, а список открывается при каждом запуске.
		 */
		const [readStates, mutedChatIds] = await Promise.all([
			this.chatReadState.getStates(userId),
			this.notificationSettings.getMutedChatIds(
				userId,
				chats.map((chat) => chat.chatId)
			)
		])

		const resChats = await Promise.all(
			chats.map(async (chat) => {
				switch (detectChatType(ChatId(chat.chatId))) {
					case ChatType.PRIVATE: {
						const user = await this.prisma.user.findUnique({ where: { id: chat.chatId } })
						if (user != null) {
							const lastMessage = await this.getLastMessage(userId, ChatId(chat.chatId))
							return plainToInstance(ChatResponseDto, {
								id: chat.chatId,
								name: user.firstName,
								isPinned: chat.isPinned,
								lastMessage: lastMessage,
								isMuted: mutedChatIds.has(chat.chatId.toString()),
								...this.unreadFields(readStates, chat.chatId)
							})
						}
					}
					case ChatType.CHANNEL: {
						const channel = await this.prisma.channel.findUnique({ where: { id: chat.chatId } })
						if (channel != null) {
							const lastMessage = await this.getLastMessage(userId, ChatId(chat.chatId))
							return plainToInstance(ChatResponseDto, {
								id: chat.chatId,
								name: channel.name,
								isPinned: chat.isPinned,
								lastMessage: lastMessage,
								isMuted: mutedChatIds.has(chat.chatId.toString()),
								...this.unreadFields(readStates, chat.chatId)
							})
						}
					}
					case ChatType.GROUP: {
						const group = await this.prisma.group.findUnique({ where: { id: chat.chatId } })
						if (group != null) {
							const lastMessage = await this.getLastMessage(userId, ChatId(chat.chatId))
							return plainToInstance(ChatResponseDto, {
								id: chat.chatId,
								name: group.name,
								isPinned: chat.isPinned,
								lastMessage: lastMessage,
								isMuted: mutedChatIds.has(chat.chatId.toString()),
								...this.unreadFields(readStates, chat.chatId)
							})
						}
					}
					default:
						return null
				}
			})
		)

		return plainToInstance(
			ChatResponseDto,
			resChats.filter((chat) => chat != null)
		)
	}

	async create(userId: UserId, chatId: ChatId): Promise<void> {
		await this.prisma.chat.upsert({
			where: {
				chat_uniq_id: `${userId}${chatId}`
			},
			update: {},
			create: {
				chat_uniq_id: `${userId}${chatId}`,
				userId: userId,
				chatId: chatId
			}
		})
		if (detectChatType(chatId) == ChatType.PRIVATE) {
			await this.prisma.chat.upsert({
				where: {
					chat_uniq_id: `${chatId}${userId}`
				},
				update: {},
				create: {
					chat_uniq_id: `${chatId}${userId}`,
					userId: chatId,
					chatId: userId
				}
			})
		}
	}

	async getById(userId: UserId, chatId: ChatId): Promise<ChatResponseDto> {
		const chat = await this.prisma.chat.findUnique({
			where: {
				chat_uniq_id: `${userId}${chatId}`
			}
		})

		if (!chat) {
			throw new NotFoundException('Chat not found')
		}

		const type = detectChatType(chatId)
		let title = ''
		const resolvedChatId = chatId

		if (type === ChatType.PRIVATE) {
			const otherUser = await this.prisma.user.findUnique({
				where: { id: chatId },
				select: { id: true, firstName: true, lastName: true }
			})
			if (otherUser) {
				title = `${otherUser.firstName ?? ''} ${otherUser.lastName ?? ''}`.trim()
			} else if (chatId === ChatId(userId)) {
				title = 'Saved messages'
			} else {
				title = 'Deleted User'
			}
		} else if (type === ChatType.GROUP) {
			const group = await this.prisma.group.findUnique({ where: { id: chatId } })
			title = group?.name ?? 'Deleted Group'
		} else if (type === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({ where: { id: chatId } })
			title = channel?.name ?? 'Deleted Channel'
		}

		const lastMessage = await this.getLastMessage(userId, chatId)

		const [readState, isEnabled] = await Promise.all([
			this.chatReadState.getState(userId, chatId),
			this.notificationSettings.isChatEnabled(userId, chatId)
		])

		return plainToInstance(ChatResponseDto, {
			id: resolvedChatId.toString(),
			name: title,
			isPinned: chat.isPinned,
			lastMessage,
			unreadCount: readState.unreadCount,
			firstUnreadMessageId: readState.firstUnreadMessageId,
			isManuallyUnread: readState.isManuallyUnread,
			isMuted: !isEnabled
		})
	}

	async canReadChat(userId: UserId, chatId: ChatId): Promise<boolean> {
		const chatType = detectChatType(chatId)

		if (chatType === ChatType.PRIVATE) {
			return true
		}

		if (chatType === ChatType.GROUP) {
			const group = await this.prisma.group.findUnique({
				where: { id: chatId },
				select: { groupType: true, ownerId: true }
			})

			if (!group) {
				throw new NotFoundException('Group not found')
			}

			if (group.groupType === GroupType.PUBLIC) {
				return true
			}

			const member = await this.prisma.groupMember.findFirst({
				where: { groupId: chatId, userId }
			})

			if (!member) {
				throw new ForbiddenException('User is not a group member')
			}

			return true
		}

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: chatId },
				select: { channelType: true, ownerId: true }
			})

			if (!channel) {
				throw new NotFoundException('Channel not found')
			}

			if (channel.channelType === ChannelType.PUBLIC) {
				return true
			}

			const subscriber = await this.prisma.channelSubscriber.findFirst({
				where: { channelId: chatId, userId }
			})

			if (subscriber) {
				return true
			}

			if (channel.ownerId !== userId) {
				throw new ForbiddenException('User is not a channel member')
			}

			return true
		}

		throw new ForbiddenException('Unsupported chat type')
	}

	async canClearHistory(userId: UserId, chatId: ChatId): Promise<boolean> {
		const chatType = detectChatType(chatId)

		if (chatType === ChatType.PRIVATE) {
			const chat = await this.prisma.chat.findFirst({
				where: { userId, chatId }
			})

			if (!chat) {
				throw new ForbiddenException('User is not a chat participant')
			}

			return true
		}

		if (chatType === ChatType.GROUP) {
			const group = await this.prisma.group.findUnique({
				where: { id: chatId },
				select: { ownerId: true }
			})

			if (!group) {
				throw new NotFoundException('Group not found')
			}

			if (group.ownerId !== userId) {
				throw new ForbiddenException('Only owner can clear group history')
			}

			return true
		}

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: chatId },
				select: { ownerId: true }
			})

			if (!channel) {
				throw new NotFoundException('Channel not found')
			}

			if (channel.ownerId !== userId) {
				throw new ForbiddenException('Only owner can clear channel history')
			}

			return true
		}

		throw new ForbiddenException('Unsupported chat type')
	}

	async exists(userId: UserId, chatId: ChatId): Promise<boolean> {
		const chat = await this.prisma.chat.findUnique({
			where: { chat_uniq_id: userId + '' + chatId }
		})
		return !!chat
	}

	async pinChats(userId: UserId, chatIds: ChatId[]): Promise<void> {
		await this.prisma.chat.updateMany({
			where: {
				userId,
				chatId: { in: chatIds }
			},
			data: { isPinned: true }
		})
		this.realtimeGateway.sendToUser(userId, SocketEvent.PIN_CHAT, {
			chatIds: chatIds.map((id) => id.toString())
		})
	}

	async unpinChats(userId: UserId, chatIds: ChatId[]): Promise<void> {
		await this.prisma.chat.updateMany({
			where: {
				userId,
				chatId: { in: chatIds }
			},
			data: { isPinned: false }
		})
		this.realtimeGateway.sendToUser(userId, SocketEvent.UNPIN_CHAT, {
			chatIds: chatIds.map((id) => id.toString())
		})
	}

	async getOnlineUserIds(userId: UserId): Promise<string[]> {
		const chats = await this.prisma.chat.findMany({
			where: { userId },
			select: { chatId: true }
		})

		const privateChats = chats.filter(
			(chat) => detectChatType(ChatId(chat.chatId)) === ChatType.PRIVATE && chat.chatId !== userId
		)

		if (privateChats.length === 0) return []

		const partnerIds = privateChats.map((c) => c.chatId)

		const privacySettings = await this.prisma.privacySettings.findMany({
			where: { userId: { in: partnerIds } },
			select: { userId: true, lastSeen: true }
		})

		const nobodySet = new Set(
			privacySettings.filter((s) => s.lastSeen === 'NOBODY').map((s) => s.userId.toString())
		)

		return privateChats
			.filter((chat) => {
				const partnerId = chat.chatId.toString()
				if (nobodySet.has(partnerId)) return false
				return this.realtimeGateway.isUserOnline(UserId(chat.chatId))
			})
			.map((chat) => chat.chatId.toString())
	}

	/** Бейдж и точка открытия для одного чата из уже загруженной карты состояний. */
	private unreadFields(
		states: Map<string, ChatReadStateDto>,
		chatId: bigint
	): { unreadCount: number; firstUnreadMessageId?: string; isManuallyUnread: boolean } {
		const state = states.get(chatId.toString())

		return {
			unreadCount: state?.unreadCount ?? 0,
			firstUnreadMessageId: state?.firstUnreadMessageId,
			isManuallyUnread: state?.isManuallyUnread ?? false
		}
	}

	private async getLastMessage(userId: UserId, chatId: ChatId): Promise<MessageResponseDto | null> {
		const chatType = detectChatType(chatId)

		let messageWhere: any
		if (chatType === ChatType.PRIVATE) {
			messageWhere = {
				OR: [
					{ senderId: userId, chatId: chatId },
					{ senderId: chatId, chatId: userId }
				]
			}
		} else {
			messageWhere = { chatId }
		}

		const message = await this.prisma.message.findFirst({
			where: messageWhere,
			include: {
				attachments: { include: { file: true } },
				systemEvent: true
			},
			orderBy: { sendTime: 'desc' }
		})

		if (message == null) return null

		/*
		 * Галочка в списке чатов берётся из курсора ChatReadState, а не из отметок:
		 * подробности «кто и когда» живут в Redis трое суток, а старый чат всё равно должен
		 * показывать «прочитано», а не сбрасываться в одну галочку через три дня.
		 */
		const isRead = await this.chatReadState.isMessageRead(userId, chatId, message)

		/*
		 * Расшифровываем той версией ключа, которой сообщение шифровали, а не текущей:
		 * после ротации ключа старые строки читались бы новым ключом, и весь список чатов
		 * снова падал бы из-за одного сообщения.
		 */
		const keyVersion = message.encryptionKeyVersion ?? this.encryption.currentVersion

		return plainToInstance(MessageResponseDto, {
			...message,
			text: message.text ? this.encryption.decrypt(message.text, keyVersion) : null,
			isRead,
			systemEventType: message.systemEvent?.eventType,
			attachments: message.attachments.map((f) =>
				plainToInstance(MessageAttachmentDto, { ...f.file, type: f.type, fileId: f.fileId })
			),
			senderId: chatType === ChatType.CHANNEL ? message.chatId : message.senderId,
			messageType: message.messageType
		})
	}
}

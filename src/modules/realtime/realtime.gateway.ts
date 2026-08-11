import { Logger, Inject, forwardRef, ValidationPipe } from '@nestjs/common'
import {
	WebSocketGateway,
	OnGatewayConnection,
	WebSocketServer,
	OnGatewayDisconnect,
	SubscribeMessage,
	MessageBody,
	ConnectedSocket,
	OnGatewayInit
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { SessionsService } from '../sessions/sessions.service'
import { instanceToPlain } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { SocketEvent, SocketEventType } from '../../common/socket/socket-events'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { PrivacyRule } from '../../generated/prisma/enums'
import { ChatsService } from '../chats/chats.service'
import { ChatOpenDto } from './dto/chat-open.dto'

@WebSocketGateway({
	maxHttpBufferSize: 1e6,
	pingTimeout: 30000
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(RealtimeGateway.name)
	private readonly onlineUsers = new Set<string>()

	@WebSocketServer()
	server: Server

	constructor(
		@Inject(forwardRef(() => SessionsService))
		private readonly sessionsService: SessionsService,
		@Inject(forwardRef(() => ChatsService))
		private readonly chatsService: ChatsService,
		private readonly prisma: PrismaService
	) {}

	afterInit(server: Server) {
		server.use(async (socket, next) => {
			try {
				const token = socket.handshake.auth.token as string
				if (!token) {
					this.logger.warn(`No token provided for socket ${socket.id}`)
					socket.emit(SocketEvent.UNAUTHORIZED)
					return next(new Error('Unauthorized'))
				}

				const session = await this.sessionsService.findByToken(token)
				if (!session) {
					this.logger.warn(`Invalid token provided for socket ${socket.id}`)
					socket.emit(SocketEvent.UNAUTHORIZED)
					return next(new Error('Unauthorized'))
				}

				/*
				 * Дальше сокет живёт с идентификатором сессии, а не с токеном: он
				 * нужен только для этой проверки, и хранить секрет в памяти сокета
				 * незачем.
				 */
				socket.data.userId = session.userId
				socket.data.sessionId = session.id
				next()
			} catch (error: any) {
				this.logger.error(`Auth error in socket middleware: ${error.message}`)
				socket.emit(SocketEvent.UNAUTHORIZED)
				next(new Error('Unauthorized'))
			}
		})
	}

	async handleConnection(client: Socket, ...args: any[]) {
		try {
			const userIdRaw = client.data.userId
			const sessionId = client.data.sessionId as number | undefined
			if (!userIdRaw) return

			if (sessionId) {
				try {
					await this.prisma.session.update({
						where: { id: sessionId },
						data: { lastSeen: BigInt(Date.now()) }
					})
				} catch (error: any) {
					this.logger.warn(`Failed to update session lastSeen on connect: ${error.message}`)
				}
			}

			const userId = UserId(userIdRaw)
			const userRoom = `user:${userId.toString()}`

			client.join(userRoom)

			this.logger.debug(`Client connected: ${userId.toString()}`)

			if (!this.onlineUsers.has(userId.toString())) {
				this.onlineUsers.add(userId.toString())

				const recipients = await this.getPresenceRecipients(userId)
				if (recipients.length > 0) {
					this.server
						.to(recipients.map((id) => `user:${id.toString()}`))
						.emit(SocketEvent.USER_ONLINE, { userId: userId.toString() })
				}
			}
		} catch (error: any) {
			this.logger.error(
				`Error in handleConnection for client ${client.id}: ${error.message}`,
				error.stack
			)
			client.disconnect()
		}
	}

	/**
	 * Пользователь открыл чат.
	 *
	 * Полезная нагрузка разбирается схемой ChatOpenDto, а не вручную из any:
	 * мусор отсекается до тела обработчика, а не падает внутри ChatId().
	 */
	@SubscribeMessage(SocketEvent.CHAT_OPEN)
	async handleChatOpen(
		@MessageBody(new ValidationPipe({ transform: true, whitelist: true }))
		payload: ChatOpenDto,
		@ConnectedSocket() client: Socket
	) {
		const userId = client.data.userId as UserId

		let chatId: ChatId
		try {
			chatId = ChatId(payload.chatId)
		} catch {
			return
		}

		try {
			await this.chatsService.canReadChat(userId, chatId)
		} catch {
			client.emit(SocketEvent.ACCESS_DENIED, { chatId: chatId.toString() })
			return
		}

		const prev = client.data.activeChatId as ChatId | undefined
		if (prev && prev !== chatId) {
			await client.leave(`chat:${prev.toString()}`)
		}
		await client.join(`chat:${chatId.toString()}`)
		client.data.activeChatId = chatId
	}

	async handleDisconnect(client: Socket) {
		this.logger.debug(`Client disconnected: ${client.id}`)
		const userId = client.data.userId as UserId | undefined
		const sessionId = client.data.sessionId as number | undefined
		if (!userId) return

		if (sessionId) {
			try {
				await this.prisma.session.update({
					where: { id: sessionId },
					data: { lastSeen: BigInt(Date.now()) }
				})
			} catch (error: any) {
				this.logger.warn(`Failed to update session lastSeen: ${error.message}`)
			}
		}

		const room = `user:${userId.toString()}`
		const sockets = await this.server.in(room).fetchSockets()
		if (sockets.length > 0) return

		this.onlineUsers.delete(userId.toString())

		const recipients = await this.getPresenceRecipients(userId)
		if (recipients.length > 0) {
			this.server
				.to(recipients.map((id) => `user:${id.toString()}`))
				.emit(SocketEvent.USER_OFFLINE, { userId: userId.toString() })
		}
	}

	/*
	 * Об отключённой сессии клиент должен узнать сразу, а не по ответу 401 на
	 * следующем запросе: на устройстве может быть другой аккаунт, и приложение
	 * переключается на него, не показывая экран авторизации.
	 */
	kickUser(userId: UserId): void {
		const room = `user:${userId.toString()}`
		this.server.to(room).emit(SocketEvent.UNAUTHORIZED)
		this.server.in(room).disconnectSockets(true)
		this.logger.log(`Kicked user ${userId.toString()} (all sessions)`)
	}

	async kickSession(sessionId: number): Promise<void> {
		const sockets = await this.server.fetchSockets()
		for (const socket of sockets) {
			if (socket.data.sessionId === sessionId) {
				socket.emit(SocketEvent.UNAUTHORIZED)
				socket.disconnect(true)
				this.logger.log(`Kicked session ${sessionId}`)
			}
		}
	}

	/**
	 * Отключает все сессии пользователя, кроме текущей: так работает завершение
	 * остальных сеансов из настроек, где сам инициатор должен остаться в аккаунте.
	 */
	async kickUserExceptSession(userId: UserId, excludeSessionId: number): Promise<void> {
		const room = `user:${userId.toString()}`
		const sockets = await this.server.in(room).fetchSockets()

		for (const socket of sockets) {
			if (socket.data.sessionId === excludeSessionId) {
				continue
			}

			socket.emit(SocketEvent.UNAUTHORIZED)
			socket.disconnect(true)
		}

		this.logger.log(`Kicked other sessions of user ${userId.toString()}`)
	}

	sendToUser(userId: UserId, event: SocketEventType, message: any, excludeId?: string): void {
		if (excludeId) {
			this.server
				.in(`user:${userId.toString()}`)
				.except(excludeId)
				.emit(event, this.prepareData(message))
		} else {
			this.server.in(`user:${userId.toString()}`).emit(event, this.prepareData(message))
		}
		this.logger.debug(`Sent message to user ${userId.toString()}:`)
	}

	sendToChat(chatId: ChatId, event: SocketEventType, message: any, excludeId?: string): void {
		if (excludeId) {
			this.server
				.in(`chat:${chatId.toString()}`)
				.except(excludeId)
				.emit(event, this.prepareData(message))
		} else {
			this.server.in(`chat:${chatId.toString()}`).emit(event, this.prepareData(message))
		}
		this.logger.debug(`Sent message to chat ${chatId.toString()}:`)
	}

	sendToUsersExceptChat(
		userIds: UserId[],
		chatId: ChatId,
		event: SocketEventType,
		message: any,
		excludeSocketId?: string
	): void {
		const userRooms = userIds.map((id) => `user:${id.toString()}`)
		const chatRoom = `chat:${chatId.toString()}`
		if (excludeSocketId) {
			this.server
				.to(userRooms)
				.except([chatRoom, excludeSocketId])
				.emit(event, this.prepareData(message))
		} else {
			this.server.to(userRooms).except(chatRoom).emit(event, this.prepareData(message))
		}
	}

	isUserOnline(userId: UserId): boolean {
		return this.onlineUsers.has(userId.toString())
	}

	private prepareData(data: any) {
		const plain = instanceToPlain(data)
		return this.serializeBigInt(plain)
	}

	private serializeBigInt(obj: any): any {
		if (obj === null || obj === undefined) return obj
		if (typeof obj === 'bigint') return obj.toString()
		if (Array.isArray(obj)) return obj.map((item) => this.serializeBigInt(item))
		if (typeof obj === 'object') {
			if (obj instanceof Date) return obj.getTime()

			return Object.fromEntries(
				Object.entries(obj).map(([key, value]) => [key, this.serializeBigInt(value)])
			)
		}
		return obj
	}

	private async getPresenceRecipients(userId: UserId): Promise<UserId[]> {
		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId },
			select: { lastSeen: true }
		})

		const visibility = settings?.lastSeen ?? PrivacyRule.EVERYBODY

		if (visibility === PrivacyRule.NOBODY) {
			return []
		}

		if (visibility === PrivacyRule.EVERYBODY) {
			const directChats = await this.prisma.chat.findMany({
				where: {
					userId
				},
				select: { chatId: true }
			})
			return directChats.filter((c) => c.chatId !== userId).map((c) => UserId(c.chatId))
		}

		const [directChats, groupMembers, channelSubs, channelOwners] = await Promise.all([
			this.prisma.chat.findMany({
				where: { userId },
				select: { chatId: true }
			}),
			this.prisma.groupMember.findMany({
				where: { userId },
				select: { groupId: true }
			}),
			this.prisma.channelSubscriber.findMany({
				where: { userId },
				select: { channelId: true }
			}),
			this.prisma.channel.findMany({
				where: { ownerId: userId },
				select: { id: true }
			})
		])

		let otherGroupMembers: { userId: bigint }[] = []
		if (groupMembers.length > 0) {
			const groupIds = groupMembers.map((g) => g.groupId)
			otherGroupMembers = await this.prisma.groupMember.findMany({
				where: { groupId: { in: groupIds }, userId: { not: userId } },
				select: { userId: true }
			})
		}

		let otherChannelSubs: { userId: bigint }[] = []
		if (channelSubs.length > 0) {
			const channelIds = channelSubs.map((c) => c.channelId)
			otherChannelSubs = await this.prisma.channelSubscriber.findMany({
				where: { channelId: { in: channelIds }, userId: { not: userId } },
				select: { userId: true }
			})
		}

		const otherChannelOwners = channelOwners
			.filter((c) => c.id !== userId)
			.map((c) => ({ userId: c.id }))

		const directChatIds = directChats
			.filter((c) => c.chatId !== userId)
			.map((c) => c.chatId.toString())

		const allUserIds = [
			...directChatIds,
			...otherGroupMembers.map((g) => g.userId.toString()),
			...otherChannelSubs.map((s) => s.userId.toString()),
			...otherChannelOwners.map((o) => o.userId.toString())
		]

		const unique = Array.from(new Set(allUserIds)).map((id) => UserId(id))
		return unique
	}
}

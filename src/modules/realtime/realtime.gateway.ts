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
import { SocketEvent, SocketEventType } from '../../common/socket/socket-events'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatsService } from '../chats/chats.service'
import { ChatOpenDto } from './dto/chat-open.dto'
import { PresenceService } from './presence.service'
import { PresenceRecipientsService } from './presence-recipients.service'
import { SessionActivityService } from './session-activity.service'

/*
 * pingInterval и pingTimeout заданы явно: сервер шлёт ping раз в 20 секунд и, если
 * pong не пришёл за 30, рвёт соединение. Дальше срабатывает handleDisconnect, и
 * собеседники узнают об офлайне тем же путём, что и при обычном выходе.
 */
@WebSocketGateway({
	maxHttpBufferSize: 1e6,
	pingInterval: 20000,
	pingTimeout: 30000
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(RealtimeGateway.name)

	@WebSocketServer()
	server: Server

	constructor(
		@Inject(forwardRef(() => SessionsService))
		private readonly sessionsService: SessionsService,
		@Inject(forwardRef(() => ChatsService))
		private readonly chatsService: ChatsService,
		private readonly presence: PresenceService,
		private readonly presenceRecipients: PresenceRecipientsService,
		private readonly sessionActivity: SessionActivityService
	) {}

	afterInit(server: Server) {
		/*
		 * PresenceService хранит состояние, но ничего не рассылает, поэтому шлюз
		 * отдаёт ему три действия: объявить онлайн, объявить офлайн и закрыть
		 * зависшее соединение.
		 */
		this.presence.setHandlers({
			announceOnline: (userId) => this.broadcastPresence(userId, SocketEvent.USER_ONLINE),
			announceOffline: (userId) => this.broadcastPresence(userId, SocketEvent.USER_OFFLINE),
			dropSocket: (socketId, reason) => this.dropSocket(socketId, reason)
		})

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

	handleConnection(client: Socket) {
		try {
			const userIdRaw = client.data.userId
			const sessionId = client.data.sessionId as number | undefined
			if (!userIdRaw) return

			const userId = UserId(userIdRaw)
			const userKey = userId.toString()

			client.join(`user:${userKey}`)

			/*
			 * Любой пакет от клиента, включая pong, продлевает жизнь соединения: по
			 * этой отметке сторож находит сокеты, которые формально открыты, но
			 * уже ничего не отвечают.
			 */
			client.conn.on('packet', () => this.presence.touch(userKey, client.id))

			this.presence.register(userKey, client.id)

			if (sessionId) {
				void this.sessionActivity.touch(sessionId)
			}

			this.logger.debug(`Client connected: ${userKey}`)
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

	/*
	 * Раньше здесь ждали fetchSockets() по комнате пользователя, чтобы понять,
	 * остались ли другие устройства. Теперь это знание есть в PresenceService, и
	 * отключение обходится без обхода комнаты.
	 */
	handleDisconnect(client: Socket) {
		const userIdRaw = client.data.userId
		const sessionId = client.data.sessionId as number | undefined
		if (!userIdRaw) return

		const userId = UserId(userIdRaw)
		this.presence.unregister(userId.toString(), client.id)

		if (sessionId) {
			void this.sessionActivity.touch(sessionId)
		}

		this.logger.debug(`Client disconnected: ${client.id}`)
	}

	/**
	 * Рассылает смену статуса собеседникам.
	 *
	 * При приватности "Никто" список пустой и наружу не уходит ничего.
	 */
	private broadcastPresence(userId: string, event: SocketEventType): void {
		void this.presenceRecipients
			.resolve(UserId(userId))
			.then((recipients) => {
				if (recipients.length === 0) return

				/*
				 * Офлайновым собеседникам событие не нужно: при следующем входе
				 * они всё равно запросят снапшот статусов. На списках в сотни
				 * человек это убирает почти всю рассылку. Заодно отсеиваются
				 * идентификаторы, которые вообще не принадлежат пользователям.
				 */
				const rooms = recipients
					.filter((recipientId) => this.presence.isOnline(recipientId))
					.map((recipientId) => `user:${recipientId}`)

				if (rooms.length === 0) return

				this.server.to(rooms).emit(event, { userId })
			})
			.catch((error: any) => {
				this.logger.error(`Failed to broadcast ${event} for ${userId}: ${error.message}`)
			})
	}

	private dropSocket(socketId: string, reason: string): void {
		const socket = this.server.sockets.sockets.get(socketId)
		if (!socket) return

		this.logger.warn(`Dropping socket ${socketId}: ${reason}`)
		socket.disconnect(true)
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

	/*
	 * Статус считается по живым сокетам: отправка сообщений по нему выбирает
	 * между вебсокетом и пушем, и задержка перед объявлением офлайна здесь
	 * учитываться не должна.
	 */
	isUserOnline(userId: UserId): boolean {
		return this.presence.isOnline(userId.toString())
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
}

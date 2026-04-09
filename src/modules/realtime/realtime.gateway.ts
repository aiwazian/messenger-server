import { Logger, Inject, forwardRef, UnauthorizedException } from '@nestjs/common'
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
import { ChatsService } from '../chats/chats.service'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { SocketEvent, SocketEventType } from '../../common/socket/socket-events'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(RealtimeGateway.name)

	@WebSocketServer()
	server: Server

	constructor(
		@Inject(forwardRef(() => SessionsService))
		private readonly sessionsService: SessionsService,
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService
	) { }

	afterInit(server: Server) {
		server.use(async (socket, next) => {
			try {
				const token = socket.handshake.auth.token as string
				if (!token) {
					this.logger.warn(`No token provided for socket ${socket.id}`)
					socket.emit(SocketEvent.UNAUTHORIZED)
					return next()
				}

				const session = await this.sessionsService.findByToken(token)
				if (!session) {
					this.logger.warn(`Invalid token provided for socket ${socket.id}`)
					socket.emit(SocketEvent.UNAUTHORIZED)
					return next()
				}

				socket.data.userId = session.userId
				socket.data.token = token
				next()
			} catch (error: any) {
				this.logger.error(`Auth error in socket middleware: ${error.message}`)
				socket.emit(SocketEvent.UNAUTHORIZED)
				next()
			}
		})
	}

	async handleConnection(client: Socket, ...args: any[]) {
		try {
			const userIdRaw = client.data.userId
			if (!userIdRaw) return

			const userId = UserId(userIdRaw)
			const userRoom = `user:${userId.toString()}`

			client.join(userRoom)

			this.logger.debug(`Client connected: ${userId.toString()}`)

			const recipients = await this.getPresenceRecipients(userId)
			if (recipients.length > 0) {
				this.server
					.to(recipients.map((id) => `user:${id.toString()}`))
					.emit(SocketEvent.USER_ONLINE, { userId: userId.toString() })
			}
		} catch (error: any) {
			this.logger.error(
				`Error in handleConnection for client ${client.id}: ${error.message}`,
				error.stack
			)
			client.disconnect()
		}
	}

	@SubscribeMessage(SocketEvent.CHAT_OPEN)
	async handleChatOpen(@MessageBody() payload: any, @ConnectedSocket() client: Socket) {
		try {
			const raw = payload?.chatId ?? payload
			const chatId = ChatId(raw)
			const userId = client.data.userId as UserId

			await this.chatsService.canReadChat(userId, chatId)

			const prev = client.data.activeChatId as ChatId | undefined
			if (prev && prev !== chatId) {
				client.leave(`chat:${prev.toString()}`)
			}

			client.join(`chat:${chatId.toString()}`)
			client.data.activeChatId = chatId
			this.logger.debug(
				`Client ${client.id} (user ${userId}) joined room chat:${chatId.toString()}`
			)
		} catch (e: any) {
			this.logger.warn(
				`Access denied or invalid chat id from client ${client.id}: ${e?.message ?? e}`
			)
		}
	}

	async handleDisconnect(client: Socket) {
		this.logger.debug(`Client disconnected: ${client.id}`)
		const userId = client.data.userId as UserId | undefined
		if (!userId) return

		const room = `user:${userId.toString()}`
		const sockets = await this.server.in(room).allSockets()
		if (sockets.size > 0) return

		const recipients = await this.getPresenceRecipients(userId)
		if (recipients.length > 0) {
			this.server
				.to(recipients.map((id) => `user:${id.toString()}`))
				.emit(SocketEvent.USER_OFFLINE, { userId: userId.toString() })
		}
	}

	kickUser(userId: UserId): void {
		const room = `user:${userId.toString()}`
		this.server.to(room).emit(SocketEvent.AUTH_ERROR)
		this.server.in(room).disconnectSockets(true)
		this.logger.log(`Kicked user ${userId.toString()} (all sessions)`)
	}

	async kickUserByToken(token: string): Promise<void> {
		const sockets = await this.server.fetchSockets()
		for (const socket of sockets) {
			if (socket.data.token === token) {
				socket.emit(SocketEvent.AUTH_ERROR)
				socket.disconnect(true)
				this.logger.log(`Kicked session with token ${token.substring(0, 10)}...`)
			}
		}
	}

	sendToUser(userId: UserId, event: SocketEventType, message: any): void {
		this.server.in(`user:${userId.toString()}`).emit(event, this.prepareData(message))
		this.logger.debug(`Sent message to user ${userId.toString()}:`)
	}

	sendToChat(chatId: ChatId, event: SocketEventType, message: any): void {
		this.server.in(`chat:${chatId.toString()}`).emit(event, this.prepareData(message))
		this.logger.debug(`Sent message to user ${chatId.toString()}:`)
	}

	sendToUsersExceptChat(
		userIds: UserId[],
		chatId: ChatId,
		event: SocketEventType,
		message: any
	): void {
		const userRooms = userIds.map((id) => `user:${id.toString()}`)
		const chatRoom = `chat:${chatId.toString()}`
		this.server.to(userRooms).except(chatRoom).emit(event, this.prepareData(message))
	}

	isUserOnline(userId: UserId): boolean {
		const room = this.server.sockets.adapter.rooms.get(`user:${userId.toString()}`)
		return !!room && room.size > 0
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

			const newObj = {}
			for (const key in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					newObj[key] = this.serializeBigInt(obj[key])
				}
			}
			return newObj
		}
		return obj
	}

	private async getPresenceRecipients(userId: UserId): Promise<UserId[]> {
		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId },
			select: { lastSeen: true }
		})

		const visibility = settings?.lastSeen ?? 0

		if (visibility === 2) {
			return []
		}

		if (visibility === 1) {
			const directMembers = await this.prisma.conversationMember.findMany({
				where: {
					conversation: {
						type: 'DIRECT',
						members: { some: { userId } }
					},
					userId: { not: userId }
				},
				select: { userId: true }
			})
			return directMembers.map((d) => UserId(d.userId))
		}

		const [directMembers, groupMembers, channelSubs, channelOwners] = await Promise.all([
			this.prisma.conversationMember.findMany({
				where: {
					conversation: { type: 'DIRECT', members: { some: { userId } } },
					userId: { not: userId }
				},
				select: { userId: true }
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

		const allUserIds = [
			...directMembers.map((d) => d.userId.toString()),
			...otherGroupMembers.map((g) => g.userId.toString()),
			...otherChannelSubs.map((s) => s.userId.toString()),
			...otherChannelOwners.map((o) => o.userId.toString())
		]

		const unique = Array.from(new Set(allUserIds)).map((id) => UserId(id))
		return unique
	}
}

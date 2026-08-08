import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { App, cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getMessaging, Messaging } from 'firebase-admin/messaging'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { PushNotificationPayload } from './push.types'

const FCM_BATCH_SIZE = 500

const STALE_TOKEN_ERROR_CODES = [
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token',
	'messaging/invalid-argument'
]

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(PushService.name)

	private app: App | null = null
	private messaging: Messaging | null = null

	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService
	) {}

	onModuleInit(): void {
		const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')
		const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL')
		const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n')

		if (!projectId || !clientEmail || !privateKey) {
			this.logger.warn('Firebase credentials are not set, push notifications are disabled')
			return
		}

		this.app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, 'push')
		this.messaging = getMessaging(this.app)
	}

	async onModuleDestroy(): Promise<void> {
		if (!this.app) return

		await deleteApp(this.app)
		this.app = null
		this.messaging = null
	}

	async sendToUsers(userIds: UserId[], payload: PushNotificationPayload): Promise<void> {
		if (userIds.length === 0) return

		const messaging = this.messaging

		if (!messaging) return

		const sessions = await this.prisma.session.findMany({
			where: {
				userId: { in: userIds }
			},
			select: { fcmToken: true }
		})

		const pushTokens = Array.from(
			new Set(sessions.map((s) => s.fcmToken).filter((t): t is string => t !== null))
		)

		if (pushTokens.length === 0) return

		const staleTokens: string[] = []

		for (let offset = 0; offset < pushTokens.length; offset += FCM_BATCH_SIZE) {
			const batch = pushTokens.slice(offset, offset + FCM_BATCH_SIZE)

			try {
				const response = await messaging.sendEachForMulticast({
					tokens: batch,
					android: { priority: 'high' },
					data: {
						title: payload.title,
						body: payload.body,
						chatId: payload.chatId
					}
				})

				response.responses.forEach((result, index) => {
					if (result.success) return

					const token = batch[index]
					const code = result.error?.code ?? 'unknown'

					if (STALE_TOKEN_ERROR_CODES.includes(code)) {
						staleTokens.push(token)
					}

					this.logger.warn(`Failed to send push notification to token ${token}: ${code}`)
				})

				this.logger.debug(
					`Sent ${response.successCount} of ${batch.length} push notifications`
				)
			} catch (e) {
				this.logger.error('Error sending push notifications', e)
			}
		}

		await this.clearStaleTokens(staleTokens)
	}

	private async clearStaleTokens(tokens: string[]): Promise<void> {
		if (tokens.length === 0) return

		try {
			await this.prisma.session.updateMany({
				where: { fcmToken: { in: tokens } },
				data: { fcmToken: null }
			})
		} catch (e) {
			this.logger.error('Error clearing stale push tokens', e)
		}
	}
}

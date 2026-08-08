import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { App, cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { BatchResponse, getMessaging, Messaging } from 'firebase-admin/messaging'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { PushNotificationPayload } from './push.types'

const FCM_BATCH_SIZE = 500

/**
 * Коды, после которых адресата нужно убрать из базы: установка удалена
 * или больше не зарегистрирована. Первый код — аналог второго для FID.
 */
const STALE_RECIPIENT_ERROR_CODES = [
	'messaging/installation-id-not-registered',
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
			select: { installationId: true, fcmToken: true }
		})

		const installationIds = this.unique(sessions.map((s) => s.installationId))

		// registration token берём только у сессий без FID: если у сессии есть оба
		// значения, отправка по двум адресам даст два уведомления на одном устройстве.
		const legacyTokens = this.unique(
			sessions.filter((s) => s.installationId === null).map((s) => s.fcmToken)
		)

		if (installationIds.length === 0 && legacyTokens.length === 0) return

		const data = {
			title: payload.title,
			body: payload.body,
			chatId: payload.chatId
		}

		const staleInstallationIds = await this.sendBatched(installationIds, (batch) =>
			messaging.sendEachForMulticast({
				fids: batch,
				android: { priority: 'high' },
				data: data
			})
		)

		const staleTokens = await this.sendBatched(legacyTokens, (batch) =>
			messaging.sendEachForMulticast({
				tokens: batch,
				android: { priority: 'high' },
				data: data
			})
		)

		await this.clearStaleRecipients(staleInstallationIds, staleTokens)
	}

	/** Отправляет пачками и возвращает адресатов, которых FCM больше не знает. */
	private async sendBatched(
		recipients: string[],
		send: (batch: string[]) => Promise<BatchResponse>
	): Promise<string[]> {
		const stale: string[] = []

		for (let offset = 0; offset < recipients.length; offset += FCM_BATCH_SIZE) {
			const batch = recipients.slice(offset, offset + FCM_BATCH_SIZE)

			try {
				const response = await send(batch)

				response.responses.forEach((result, index) => {
					if (result.success) return

					const recipient = batch[index]
					const code = result.error?.code ?? 'unknown'

					if (STALE_RECIPIENT_ERROR_CODES.includes(code)) {
						stale.push(recipient)
					}

					this.logger.warn(`Failed to send push notification to ${recipient}: ${code}`)
				})

				this.logger.debug(
					`Sent ${response.successCount} of ${batch.length} push notifications`
				)
			} catch (e) {
				this.logger.error('Error sending push notifications', e)
			}
		}

		return stale
	}

	private async clearStaleRecipients(
		installationIds: string[],
		tokens: string[]
	): Promise<void> {
		try {
			if (installationIds.length > 0) {
				await this.prisma.session.updateMany({
					where: { installationId: { in: installationIds } },
					data: { installationId: null }
				})
			}

			if (tokens.length > 0) {
				await this.prisma.session.updateMany({
					where: { fcmToken: { in: tokens } },
					data: { fcmToken: null }
				})
			}
		} catch (e) {
			this.logger.error('Error clearing stale push recipients', e)
		}
	}

	private unique(values: (string | null)[]): string[] {
		return Array.from(new Set(values.filter((v): v is string => v !== null)))
	}
}

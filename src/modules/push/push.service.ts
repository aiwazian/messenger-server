import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { App, cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getMessaging, Messaging } from 'firebase-admin/messaging'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { PushNotificationPayload } from './push.types'

const FCM_BATCH_SIZE = 500

/**
 * Коды, после которых установку нужно убрать из базы: приложение удалено
 * или его данные очищены, и этот FID больше никому не принадлежит.
 */
const STALE_INSTALLATION_ID_ERROR_CODES = [
	'messaging/installation-id-not-registered',
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
			select: { installationId: true }
		})

		// Сессий на одном устройстве может быть несколько, а FID у них один:
		// без Set одно уведомление пришло бы на телефон несколько раз.
		const installationIds = Array.from(
			new Set(sessions.map((s) => s.installationId).filter((id): id is string => id !== null))
		)

		if (installationIds.length === 0) return

		const staleInstallationIds: string[] = []

		for (let offset = 0; offset < installationIds.length; offset += FCM_BATCH_SIZE) {
			const batch = installationIds.slice(offset, offset + FCM_BATCH_SIZE)

			try {
				const response = await messaging.sendEachForMulticast({
					fids: batch,
					android: { priority: 'high' },
					data: {
						title: payload.title,
						body: payload.body,
						chatId: payload.chatId
					}
				})

				response.responses.forEach((result, index) => {
					if (result.success) return

					const installationId = batch[index]
					const code = result.error?.code ?? 'unknown'

					if (STALE_INSTALLATION_ID_ERROR_CODES.includes(code)) {
						staleInstallationIds.push(installationId)
					}

					this.logger.warn(`Failed to send push notification: ${code}`)
				})

				this.logger.debug(
					`Sent ${response.successCount} of ${batch.length} push notifications`
				)
			} catch (e) {
				this.logger.error('Error sending push notifications', e)
			}
		}

		await this.clearStaleInstallationIds(staleInstallationIds)
	}

	private async clearStaleInstallationIds(installationIds: string[]): Promise<void> {
		if (installationIds.length === 0) return

		try {
			await this.prisma.session.updateMany({
				where: { installationId: { in: installationIds } },
				data: { installationId: null }
			})
		} catch (e) {
			this.logger.error('Error clearing stale installation ids', e)
		}
	}
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { App, cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getMessaging, Messaging } from 'firebase-admin/messaging'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import {
	extractCustomEmojiIds,
	replaceCustomEmojiTokens
} from '../../common/utils/custom-emoji.util'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { PushNotificationPayload } from './push.types'
import { NotificationSettingsService } from '../notification-settings/notification-settings.service'

const FCM_BATCH_SIZE = 500

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
		private readonly prisma: PrismaService,
		private readonly notificationSettings: NotificationSettingsService
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

		const recipients = await this.notificationSettings.filterPushRecipients(
			userIds,
			payload.chatType ?? this.detectChatType(payload.chatId),
			this.toChatId(payload.recipientChatId ?? payload.chatId)
		)

		if (recipients.length === 0) return

		const sessions = await this.prisma.session.findMany({
			where: {
				userId: { in: recipients },
				installationId: { not: null }
			},
			select: { userId: true, installationId: true }
		})

		const sendTime = payload.sendTime ?? Date.now().toString()
		const body = await this.resolveBody(payload.body)

		const staleInstallationIds: string[] = []

		for (const [userId, installationIds] of this.groupByRecipient(sessions)) {
			for (let offset = 0; offset < installationIds.length; offset += FCM_BATCH_SIZE) {
				const batch = installationIds.slice(offset, offset + FCM_BATCH_SIZE)

				try {
					const response = await messaging.sendEachForMulticast({
						fids: batch,
						android: { priority: 'high' },
						data: {
							userId,
							title: payload.title,
							body,
							chatId: payload.chatId,
							sendTime
						}
					})

					response.responses.forEach((result, index) => {
						if (result.success) return

						const code = result.error?.code ?? 'unknown'

						if (STALE_INSTALLATION_ID_ERROR_CODES.includes(code)) {
							staleInstallationIds.push(batch[index])
						}

						this.logger.warn(`Failed to send push notification: ${code}`)
					})

					this.logger.debug(`Sent ${response.successCount} of ${batch.length} push notifications`)
				} catch (e) {
					this.logger.error('Error sending push notifications', e)
				}
			}
		}

		await this.clearStaleInstallationIds(staleInstallationIds)
	}

	private async resolveBody(body: string): Promise<string> {
		const emojiIds = extractCustomEmojiIds(body)

		if (emojiIds.length === 0) return body

		const symbols = new Map<string, string>()

		try {
			const emojis = await this.prisma.emoji.findMany({
				where: { id: { in: emojiIds } },
				select: { id: true, emojis: true }
			})

			for (const emoji of emojis) {
				const symbol = emoji.emojis[0]

				if (symbol) {
					symbols.set(emoji.id.toString(), symbol)
				}
			}
		} catch (e) {
			this.logger.error('Error resolving custom emoji for push notification', e)
		}

		return replaceCustomEmojiTokens(body, symbols)
	}

	private detectChatType(chatId: string): ChatType {
		const parsed = this.toChatId(chatId)

		return parsed ? detectChatType(parsed) : ChatType.UNKNOWN
	}

	private toChatId(chatId: string): ChatId | undefined {
		try {
			return ChatId(chatId)
		} catch {
			return undefined
		}
	}

	private groupByRecipient(
		sessions: { userId: bigint; installationId: string | null }[]
	): Map<string, string[]> {
		const grouped = new Map<string, Set<string>>()

		for (const session of sessions) {
			if (!session.installationId) continue

			const userId = session.userId.toString()
			const installationIds = grouped.get(userId) ?? new Set<string>()

			installationIds.add(session.installationId)
			grouped.set(userId, installationIds)
		}

		const result = new Map<string, string[]>()

		for (const [userId, installationIds] of grouped) {
			result.set(userId, Array.from(installationIds))
		}

		return result
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

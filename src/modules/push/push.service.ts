import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { PushNotificationPayload } from './push.types'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class PushService {
	private readonly logger = new Logger(PushService.name)

	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService
	) { }

	async sendToUsers(userIds: UserId[], payload: PushNotificationPayload): Promise<void> {
		if (userIds.length === 0) return

		const sessions = await this.prisma.session.findMany({
			where: {
				userId: { in: userIds },
			},
			select: { fcmToken: true }
		})

		const pushTokens = Array.from(new Set(sessions.map((s) => s.fcmToken).filter((t) => t !== null)))

		if (pushTokens.length === 0) return

		const projectId = this.config.get('RUSTORE_PROJECT_ID')
		const serviceKey = this.config.get('RUSTORE_PUSH_SERVICE_KEY')

		pushTokens.forEach(async token => {
			try {
				fetch(`https://vkpns.rustore.ru/v1/projects/${projectId}/messages:send`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': 'Bearer ' + serviceKey
					},
					body: JSON.stringify({
						message: {
							token: token,
							data: {
								title: payload.title,
								body: payload.body,
								chatId: payload.chatId,
							}
						}
					})
				})
				this.logger.debug(`Sent push notification to token ${token}`)
			} catch (e) {
				this.logger.error('Error sending push notification', e)
			}
		})
	}
}

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PushPayload, PushProvider } from '../push.types'
import * as admin from 'firebase-admin'
import * as path from 'path'

@Injectable()
export class FirebasePushProvider implements PushProvider {
	private readonly logger = new Logger(FirebasePushProvider.name)

	constructor(private readonly config: ConfigService) {
		this.ensureInitialized()
	}

	async sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
		if (tokens.length === 0) return

		try {
			const message: admin.messaging.MulticastMessage = {
				tokens,
				notification: {
					title: payload.title,
					body: payload.body
				},
				data: payload.data
			}

			const res = await admin.messaging().sendEachForMulticast(message)

			if (res.failureCount > 0) {
				const failed = res.responses
					.map((r, i) => (r.success ? null : tokens[i]))
					.filter((t): t is string => !!t)
				this.logger.warn(`Push failed for ${failed.length} tokens`)
			}
		} catch (err) {
			this.logger.error('Push send failed', err as Error)
		}
	}

	private ensureInitialized(): void {
		if (admin.apps.length > 0) return

		const serviceAccountPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH')

		const fullPath = path.resolve(process.cwd(), serviceAccountPath)

		admin.initializeApp({
			credential: admin.credential.cert(fullPath)
		})
	}
}

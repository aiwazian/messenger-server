import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PushService } from './push.service'
import { FirebasePushProvider } from './providers/firebase-push.provider'
import { PUSH_PROVIDER } from './push.types'

@Module({
	imports: [ConfigModule],
	providers: [
		PushService,
		FirebasePushProvider,
		{ provide: PUSH_PROVIDER, useExisting: FirebasePushProvider }
	],
	exports: [PushService]
})
export class PushModule {}

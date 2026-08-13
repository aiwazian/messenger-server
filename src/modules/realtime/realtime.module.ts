import { Global, Module, forwardRef } from '@nestjs/common'
import { RealtimeGateway } from './realtime.gateway'
import { PresenceService } from './presence.service'
import { PresenceRecipientsService } from './presence-recipients.service'
import { SessionActivityService } from './session-activity.service'
import { SessionsModule } from '../sessions/sessions.module'
import { ChatsModule } from '../chats/chats.module'

@Global()
@Module({
	imports: [forwardRef(() => SessionsModule), forwardRef(() => ChatsModule)],
	providers: [
		RealtimeGateway,
		PresenceService,
		PresenceRecipientsService,
		SessionActivityService
	],
	exports: [RealtimeGateway, PresenceService, PresenceRecipientsService]
})
export class RealtimeModule {}

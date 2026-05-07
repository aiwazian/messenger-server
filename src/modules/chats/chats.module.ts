import { Module, forwardRef } from '@nestjs/common'
import { ChatsService } from './chats.service'
import { ChatsController } from './chats.controller'
import { JwtAuthModule } from '../security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { InvitesModule } from '../invites/invites.module'
import { EncryptionService } from '../encryption/encryption.service'

@Module({
	imports: [JwtAuthModule, forwardRef(() => SessionsModule), InvitesModule],
	controllers: [ChatsController],
	providers: [ChatsService, EncryptionService],
	exports: [ChatsService]
})
export class ChatsModule {}

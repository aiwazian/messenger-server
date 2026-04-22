import { Module, forwardRef } from '@nestjs/common'
import { ChatsService } from './chats.service'
import { ChatsController } from './chats.controller'
import { JwtAuthModule } from '../security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { InviteLinksService } from './invite-links.service'
import { EncryptionService } from '../encryption/encryption.service'

@Module({
	imports: [JwtAuthModule, forwardRef(() => SessionsModule)],
	controllers: [ChatsController],
	providers: [ChatsService, InviteLinksService, EncryptionService],
	exports: [ChatsService, InviteLinksService]
})
export class ChatsModule { }

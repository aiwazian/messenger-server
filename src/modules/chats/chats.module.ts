import { Module, forwardRef } from '@nestjs/common'
import { ChatsService } from './chats.service'
import { ChatsController } from './chats.controller'
import { JwtAuthModule } from '../security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { InvitesModule } from '../invites/invites.module'
import { EncryptionService } from '../encryption/encryption.service'
import { DeleteChatUseCase } from './use-cases/delete-chat.use-case'
import { MessagesModule } from '../messages/messages.module'

@Module({
	imports: [JwtAuthModule, forwardRef(() => SessionsModule), InvitesModule, MessagesModule],
	controllers: [ChatsController],
	providers: [ChatsService, EncryptionService, DeleteChatUseCase],
	exports: [ChatsService]
})
export class ChatsModule { }

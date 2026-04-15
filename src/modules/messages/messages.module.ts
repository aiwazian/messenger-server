import { Module } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { MessagesController } from './messages.controller'
import { JwtAuthModule } from '../security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { PushModule } from '../push/push.module'
import { ChatsModule } from '../chats/chats.module'
import { StorageModule } from '../storage/storage.module'

@Module({
	imports: [JwtAuthModule, SessionsModule, PushModule, ChatsModule, StorageModule],
	controllers: [MessagesController],
	providers: [MessagesService],
	exports: [MessagesService]
})
export class MessagesModule { }

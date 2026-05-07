import { Module } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { MessagesController } from './messages.controller'
import { JwtAuthModule } from '../security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { PushModule } from '../push/push.module'
import { ChatsModule } from '../chats/chats.module'
import { StorageModule } from '../storage/storage.module'
import { EncryptionService } from '../encryption/encryption.service'
import { SendMessageUseCase } from './use-cases/send-message.use-case'
import { PrismaService } from '../../providers/prisma/prisma.service'

@Module({
	imports: [JwtAuthModule, SessionsModule, PushModule, ChatsModule, StorageModule],
	controllers: [MessagesController],
	providers: [MessagesService, EncryptionService, SendMessageUseCase, PrismaService],
	exports: [MessagesService]
})
export class MessagesModule {}

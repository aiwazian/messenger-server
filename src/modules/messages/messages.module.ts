import { forwardRef, Module } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { MessagesController } from './messages.controller'
import { JwtAuthModule } from '../security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { PushModule } from '../push/push.module'
import { ChatsModule } from '../chats/chats.module'
import { StorageModule } from '../storage/storage.module'
import { SendMessageUseCase } from './use-cases/send-message.use-case'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { EncryptionModule } from '../encryption/encryption.module'

@Module({
	imports: [
		JwtAuthModule,
		forwardRef(() => SessionsModule),
		PushModule,
		forwardRef(() => ChatsModule),
		StorageModule,
		EncryptionModule
	],
	controllers: [MessagesController],
	providers: [MessagesService, SendMessageUseCase, PrismaService],
	exports: [MessagesService]
})
export class MessagesModule {}

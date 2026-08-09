import { forwardRef, Module } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { MessagesController } from './messages.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { PushModule } from '../push/push.module'
import { ChatsModule } from '../chats/chats.module'
import { StorageModule } from '../storage/storage.module'
import { SendMessageUseCase } from './use-cases/send-message.use-case'
import { GetMessagesWindowUseCase } from './use-cases/get-messages-window.use-case'
import { SearchChatMessagesUseCase } from './use-cases/search-chat-messages.use-case'
import { ForwardMessageUseCase } from './use-cases/forward-message.use-case'
import { ChatSourceResolver } from './chat-source.resolver'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { EncryptionModule } from '../encryption/encryption.module'

@Module({
	imports: [
		forwardRef(() => SessionsModule),
		PushModule,
		forwardRef(() => ChatsModule),
		StorageModule,
		EncryptionModule
	],
	controllers: [MessagesController],
	providers: [
		MessagesService,
		SendMessageUseCase,
		GetMessagesWindowUseCase,
		SearchChatMessagesUseCase,
		ForwardMessageUseCase,
		ChatSourceResolver,
		PrismaService
	],
	exports: [MessagesService]
})
export class MessagesModule {}

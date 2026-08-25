import { forwardRef, Module } from '@nestjs/common'
import { ChatMediaController } from './chat-media.controller'
import { ChatMediaService } from './chat-media.service'
import { MessagesModule } from '../messages/messages.module'
import { ChatsModule } from '../chats/chats.module'
import { PrismaService } from '../../providers/prisma/prisma.service'

/**
 * ChatsModule нужен ради CanReadChatGuard, MessagesModule — ради условия
 * видимости истории. Оба через forwardRef: цепочка чатов и сообщений уже
 * закольцована между собой.
 */
@Module({
	imports: [forwardRef(() => MessagesModule), forwardRef(() => ChatsModule)],
	controllers: [ChatMediaController],
	providers: [ChatMediaService, PrismaService],
	exports: [ChatMediaService]
})
export class ChatMediaModule {}

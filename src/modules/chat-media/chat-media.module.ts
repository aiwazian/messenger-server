import { forwardRef, Module } from '@nestjs/common'
import { ChatMediaController } from './chat-media.controller'
import { ChatMediaService } from './chat-media.service'
import { MessagesModule } from '../messages/messages.module'
import { ChatsModule } from '../chats/chats.module'

/**
 * ChatsModule нужен ради CanReadChatGuard, MessagesModule — ради условия
 * видимости истории. Оба через forwardRef: цепочка чатов и сообщений уже
 * закольцована между собой.
 *
 * PrismaService здесь не объявляется: PrismaModule помечен как @Global() и
 * экспортирует уже собранный экземпляр вместе с его EncryptionService.
 * Локальное объявление заставляло Nest строить второй экземпляр в контексте
 * этого модуля, где EncryptionService не виден.
 */
@Module({
	imports: [forwardRef(() => MessagesModule), forwardRef(() => ChatsModule)],
	controllers: [ChatMediaController],
	providers: [ChatMediaService],
	exports: [ChatMediaService]
})
export class ChatMediaModule {}

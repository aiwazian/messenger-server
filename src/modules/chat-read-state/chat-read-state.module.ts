import { Global, Module } from '@nestjs/common'
import { ChatReadStateService } from './chat-read-state.service'
import { PrismaService } from '../../providers/prisma/prisma.service'

/**
 * Глобальный по той же причине, что и RealtimeModule: состояние прочтения требуется
 * в chats, messages и группах/каналах, а лишние forwardRef между ними ничего не дают.
 */
@Global()
@Module({
	providers: [ChatReadStateService],
	exports: [ChatReadStateService]
})
export class ChatReadStateModule { }

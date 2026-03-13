import { Global, Module, forwardRef } from '@nestjs/common'
import { RealtimeGateway } from './realtime.gateway'
import { SessionsModule } from '../sessions/sessions.module'
import { ChatsModule } from '../chats/chats.module'

@Global()
@Module({
    imports: [forwardRef(() => SessionsModule), ChatsModule],
    providers: [RealtimeGateway],
    exports: [RealtimeGateway],
})
export class RealtimeModule { }
import { Module } from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { ChannelsController } from './channels.controller'
import { JwtAuthModule } from 'src/modules/security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'

@Module({
	imports: [JwtAuthModule, SessionsModule, SearchModule, ChatsModule],
	controllers: [ChannelsController],
	providers: [ChannelsService]
})
export class ChannelsModule {}

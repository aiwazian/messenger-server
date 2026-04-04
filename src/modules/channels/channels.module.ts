import { Module } from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { ChannelsController } from './channels.controller'
import { ChannelInviteLinksController } from './channel-invite-links.controller'
import { JwtAuthModule } from 'src/modules/security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'
import { PrismaModule } from 'src/providers/prisma/prisma.module'

@Module({
	imports: [JwtAuthModule, SessionsModule, SearchModule, ChatsModule, PrismaModule],
	controllers: [ChannelsController, ChannelInviteLinksController],
	providers: [ChannelsService]
})
export class ChannelsModule {}

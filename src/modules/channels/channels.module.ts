import { Module } from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { ChannelsController } from './channels.controller'
import { ChannelInviteLinksController } from './channel-invite-links.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'
import { JwtAuthModule } from '../security/jwt.module'
import { PrismaModule } from '../../providers/prisma/prisma.module'
import { EncryptionService } from '../encryption/encryption.service'

@Module({
	imports: [JwtAuthModule, SessionsModule, SearchModule, ChatsModule, PrismaModule],
	controllers: [ChannelsController, ChannelInviteLinksController],
	providers: [ChannelsService, EncryptionService]
})
export class ChannelsModule { }

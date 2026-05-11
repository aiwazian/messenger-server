import { Module } from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { ChannelsController } from './channels.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'
import { JwtAuthModule } from '../security/jwt.module'
import { PrismaModule } from '../../providers/prisma/prisma.module'
import { EncryptionService } from '../encryption/encryption.service'
import { InviteLinksService } from '../invites/invite-links.service'
import { CreateChannelUseCase } from './use-cases/create-channel.use-case'

@Module({
	imports: [JwtAuthModule, SessionsModule, SearchModule, ChatsModule, PrismaModule],
	controllers: [ChannelsController],
	providers: [ChannelsService, EncryptionService, InviteLinksService, CreateChannelUseCase]
})
export class ChannelsModule { }

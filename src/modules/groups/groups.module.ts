import { Module } from '@nestjs/common'
import { GroupsService } from './groups.service'
import { GroupsController } from './groups.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'
import { JwtAuthModule } from '../security/jwt.module'
import { EncryptionService } from '../encryption/encryption.service'
import { InviteLinksService } from '../invites/invite-links.service'

@Module({
	imports: [JwtAuthModule, SessionsModule, SearchModule, ChatsModule],
	controllers: [GroupsController],
	providers: [GroupsService, EncryptionService, InviteLinksService]
})
export class GroupsModule {}

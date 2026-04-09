import { Module } from '@nestjs/common'
import { GroupsService } from './groups.service'
import { GroupsController } from './groups.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'
import { GroupInviteLinksController } from './group-invite-links.controller'
import { JwtAuthModule } from '../security/jwt.module'

@Module({
	imports: [JwtAuthModule, SessionsModule, SearchModule, ChatsModule],
	controllers: [GroupsController, GroupInviteLinksController],
	providers: [GroupsService]
})
export class GroupsModule { }

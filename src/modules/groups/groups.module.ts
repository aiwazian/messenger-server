import { Module } from '@nestjs/common'
import { GroupsService } from './groups.service'
import { GroupsController } from './groups.controller'
import { JwtAuthModule } from 'src/modules/security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'

@Module({
    imports: [JwtAuthModule, SessionsModule, SearchModule, ChatsModule],
    controllers: [GroupsController],
    providers: [GroupsService]
})
export class GroupsModule { }

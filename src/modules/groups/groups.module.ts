import { Module } from '@nestjs/common'
import { GroupsService } from './groups.service'
import { GroupsController } from './groups.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'
import { EncryptionService } from '../encryption/encryption.service'
import { InviteLinksService } from '../invites/invite-links.service'
import { CreateGroupUseCase } from './use-cases/create-group.use-case'
import { StorageModule } from '../storage/storage.module'
import { GroupAdminsService } from './group-admins.service'

@Module({
	/* См. комментарий в ChannelsModule: хранилище подключается модулем. */
	imports: [SessionsModule, SearchModule, ChatsModule, StorageModule],
	controllers: [GroupsController],
	providers: [
		GroupsService,
		GroupAdminsService,
		EncryptionService,
		InviteLinksService,
		CreateGroupUseCase
	],
	exports: [GroupAdminsService]
})
export class GroupsModule {}

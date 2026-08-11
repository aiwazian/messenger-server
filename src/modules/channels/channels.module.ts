import { Module } from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { ChannelsController } from './channels.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { ChatsModule } from '../chats/chats.module'
import { PrismaModule } from '../../providers/prisma/prisma.module'
import { EncryptionService } from '../encryption/encryption.service'
import { InviteLinksService } from '../invites/invite-links.service'
import { CreateChannelUseCase } from './use-cases/create-channel.use-case'
import { StorageModule } from '../storage/storage.module'
import { ChannelAdminsService } from './channel-admins.service'

@Module({
	/*
	 * StorageService больше не объявляется здесь провайдером: у него появились
	 * собственные зависимости, и второй экземпляр вне StorageModule не собрался бы.
	 */
	imports: [SessionsModule, SearchModule, ChatsModule, PrismaModule, StorageModule],
	controllers: [ChannelsController],
	providers: [
		ChannelsService,
		ChannelAdminsService,
		EncryptionService,
		InviteLinksService,
		CreateChannelUseCase
	],
	exports: [ChannelAdminsService]
})
export class ChannelsModule {}

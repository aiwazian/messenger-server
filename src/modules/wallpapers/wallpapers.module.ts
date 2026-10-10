import { Module } from '@nestjs/common'
import { WallpapersController } from './wallpapers.controller'
import { WallpapersService } from './wallpapers.service'
import { StorageModule } from '../storage/storage.module'
import { ChatsModule } from '../chats/chats.module'
import { ChannelsModule } from '../channels/channels.module'
import { GroupsModule } from '../groups/groups.module'

@Module({
	imports: [StorageModule, ChatsModule, ChannelsModule, GroupsModule],
	controllers: [WallpapersController],
	providers: [WallpapersService],
	exports: [WallpapersService]
})
export class WallpapersModule {}

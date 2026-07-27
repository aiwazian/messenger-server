import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { UsersModule } from './modules/users/users.module'
import { ChannelsModule } from './modules/channels/channels.module'
import { AuthModule } from './modules/auth/auth.module'
import { SessionsModule } from './modules/sessions/sessions.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { GroupsModule } from './modules/groups/groups.module'
import { ChatsModule } from './modules/chats/chats.module'
import { MessagesModule } from './modules/messages/messages.module'
import { PrismaModule } from './providers/prisma/prisma.module'
import { SearchModule } from './modules/search/search.module'
import { PushModule } from './modules/push/push.module'
import { StorageModule } from './modules/storage/storage.module'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { AuthGuard } from './common/guards/auth.guard'
import { JwtAuthModule } from './modules/security/jwt.module'
import { ChatReadStateModule } from './modules/chat-read-state/chat-read-state.module'

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		ScheduleModule.forRoot(),
		ThrottlerModule.forRoot([
			{
				ttl: 60000,
				limit: 100
			}
		]),
		PrismaModule,
		UsersModule,
		ChannelsModule,
		AuthModule,
		SessionsModule,
		RealtimeModule,
		GroupsModule,
		ChatsModule,
		MessagesModule,
		SearchModule,
		PushModule,
		StorageModule,
		JwtAuthModule,
		ChatReadStateModule
	],
	controllers: [AppController],
	providers: [
		AppService,
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard
		},
		{
			provide: APP_GUARD,
			useClass: AuthGuard
		}
	]
})
export class AppModule {}

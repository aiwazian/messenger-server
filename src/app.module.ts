import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { UsersModule } from './modules/users/users.module'
import { ChannelsModule } from './modules/channels/channels.module'
import { AuthModule } from './modules/auth/auth.module'
import { AuthMiddleware } from './common/middlewares/auth.middleware'
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

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ThrottlerModule.forRoot([{
            ttl: 60000,
            limit: 100,
        }]),
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
        StorageModule
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        }
    ]
})
export class AppModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(AuthMiddleware)
            .exclude(
                { path: 'auth/*path', method: RequestMethod.ALL },
                { path: 'auth', method: RequestMethod.ALL }
            )
            .forRoutes('*path')
    }
}

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import * as Joi from 'joi'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { UsersModule } from './modules/users/users.module'
import { ChannelsModule } from './modules/channels/channels.module'
import { AuthModule } from './modules/auth/auth.module'
import { SessionsModule } from './modules/sessions/sessions.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { GroupsModule } from './modules/groups/groups.module'
import { ChatsModule } from './modules/chats/chats.module'
import { ChatFoldersModule } from './modules/chat-folders/chat-folders.module'
import { ChatMediaModule } from './modules/chat-media/chat-media.module'
import { MessagesModule } from './modules/messages/messages.module'
import { PrismaModule } from './providers/prisma/prisma.module'
import { RedisModule } from './providers/redis/redis.module'
import { SearchModule } from './modules/search/search.module'
import { PushModule } from './modules/push/push.module'
import { StorageModule } from './modules/storage/storage.module'
import { StickersModule } from './modules/stickers/stickers.module'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { AuthGuard } from './common/guards/auth.guard'
import { ChatReadStateModule } from './modules/chat-read-state/chat-read-state.module'
import { NotificationSettingsModule } from './modules/notification-settings/notification-settings.module'

@Module({
	imports: [
		/*
		 * Конфигурация проверяется на старте, а не в момент первого обращения.
		 *
		 * Раньше значения читались через `config.get(...)!`, поэтому опечатка или
		 * забытая переменная не роняли приложение: сервер поднимался и падал позже
		 * и в неожиданном месте. Например, отсутствующий SERVER_PORT превращался в
		 * `listen(undefined)`, а CURRENT_ENCRYPTION_VERSION — в ключ
		 * `ENCRYPTION_KEY_VNaN` уже во время шифрования сообщения.
		 *
		 * abortEarly: false — в логе сразу весь список проблем, а не первая из них.
		 */
		ConfigModule.forRoot({
			isGlobal: true,
			validationSchema: Joi.object({
				DATABASE_URL: Joi.string().uri().required(),
				SERVER_PORT: Joi.number().port().required(),

				REDIS_URL: Joi.string().uri().required(),

				S3_ACCESS_KEY: Joi.string().required(),
				S3_SECRET_KEY: Joi.string().required(),
				S3_END_POINT: Joi.string().uri().required(),
				S3_BUCKET_NAME: Joi.string().required(),
				S3_REGION: Joi.string().required(),

				/*
				 * Публичная раздача стикеров.
				 *
				 * Стикеры отдаются без подписи, поэтому к их каталогу нужен
				 * открытый доступ на чтение: либо политикой бакета на префикс
				 * stickers/, либо отдельным публичным бакетом.
				 *
				 * S3_PUBLIC_BUCKET_NAME нужна только во втором случае. Если её нет,
				 * стикеры лежат в том же бакете, что и остальные файлы.
				 *
				 * CDN_PUBLIC_BASE_URL — домен перед этим каталогом. Отдаётся клиенту
				 * готовой ссылкой, а не собирается на клиенте, чтобы смена CDN не
				 * требовала новой версии приложения. Пока CDN не подключён, сюда
				 * можно вписать адрес самого бакета: форма ссылок не изменится.
				 */
				S3_PUBLIC_BUCKET_NAME: Joi.string().optional(),
				CDN_PUBLIC_BASE_URL: Joi.string().uri().required(),

				/*
				 * Ключ шифрования читается как hex в 32 байта: строка другой длины или с
				 * не-hex символами молча превращалась в короткий Buffer и ломала AES-GCM.
				 */
				ENCRYPTION_KEY_V1: Joi.string().hex().length(64).required(),
				CURRENT_ENCRYPTION_VERSION: Joi.number().integer().min(1).required(),

				AI_API_URL: Joi.string().uri().required(),
				AI_API_KEY: Joi.string().required(),
				AI_API_MODEL: Joi.string().required(),

				SYSTEM_USER_LOGIN: Joi.string().required(),
				SYSTEM_USER_PASSWORD: Joi.string().required(),
				SYSTEM_USER_NAME: Joi.string().required(),

				FIREBASE_PROJECT_ID: Joi.string().required(),
				FIREBASE_CLIENT_EMAIL: Joi.string().email().required(),
				FIREBASE_PRIVATE_KEY: Joi.string().required(),

				SMTP_HOST: Joi.string().required(),
				SMTP_PORT: Joi.number().port().required(),
				SMTP_SECURE: Joi.boolean().required(),
				SMTP_USER: Joi.string().required(),
				SMTP_PASS: Joi.string().required(),
				SMTP_FROM: Joi.string().required()
			}),
			validationOptions: { abortEarly: false }
		}),
		ScheduleModule.forRoot(),
		ThrottlerModule.forRoot([
			{
				ttl: 60000,
				limit: 100
			}
		]),
		PrismaModule,
		RedisModule,
		UsersModule,
		ChannelsModule,
		AuthModule,
		SessionsModule,
		RealtimeModule,
		GroupsModule,
		ChatsModule,
		ChatFoldersModule,
		ChatMediaModule,
		MessagesModule,
		SearchModule,
		NotificationSettingsModule,
		PushModule,
		StorageModule,
		StickersModule,
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

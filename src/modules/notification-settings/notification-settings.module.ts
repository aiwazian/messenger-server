import { Global, Module } from '@nestjs/common'
import { NotificationSettingsService } from './notification-settings.service'
import { NotificationSettingsController } from './notification-settings.controller'

/**
 * Глобальный по той же причине, что RealtimeModule и ChatReadStateModule:
 * настройки уведомлений читает PushService, а он подключён почти везде.
 */
@Global()
@Module({
	controllers: [NotificationSettingsController],
	providers: [NotificationSettingsService],
	exports: [NotificationSettingsService]
})
export class NotificationSettingsModule {}

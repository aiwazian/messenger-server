import { IsBoolean, IsOptional } from 'class-validator'

/**
 * Частичное обновление: клиент шлёт только переключённый тумблер.
 *
 * Отправлять все три значения нельзя — два устройства, переключившие разные
 * категории одновременно, затёрли бы правки друг друга.
 */
export class UpdateNotificationSettingsDto {
	@IsOptional()
	@IsBoolean()
	privateChats?: boolean

	@IsOptional()
	@IsBoolean()
	groups?: boolean

	@IsOptional()
	@IsBoolean()
	channels?: boolean
}

import { Injectable, Logger } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SocketEvent } from '../../common/socket/socket-events'
import { UserId } from '../../common/types/user-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import { Prisma } from '../../generated/prisma/client'
import { NotificationSettingsDto } from './dto/notification-settings.dto'
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto'

/**
 * Значения по умолчанию: уведомления включены везде.
 *
 * Строки в базе у большинства пользователей не будет вовсе — заводить её
 * каждому ради трёх true незачем. Отсутствие строки и есть «всё включено».
 */
const DEFAULT_SETTINGS = {
	privateChats: true,
	groups: true,
	channels: true
}

type SettingsRow = {
	privateChats: boolean
	groups: boolean
	channels: boolean
}

@Injectable()
export class NotificationSettingsService {
	private readonly logger = new Logger(NotificationSettingsService.name)

	constructor(
		private readonly prisma: PrismaService,
		private readonly realtimeGateway: RealtimeGateway
	) {}

	async get(userId: UserId): Promise<NotificationSettingsDto> {
		const row = await this.prisma.notificationSettings.findUnique({ where: { userId } })

		return this.toDto(row ?? DEFAULT_SETTINGS)
	}

	/**
	 * Переключение тумблера на одном из устройств.
	 *
	 * Событие уходит во все сессии, включая инициатора: значение идемпотентно,
	 * а инициатор к этому моменту уже применил его локально. Зато остальные
	 * устройства узнают об изменении сразу, а не при следующем запуске: иначе
	 * локальная проверка перед показом уведомления работала бы по устаревшим данным.
	 */
	async update(
		userId: UserId,
		dto: UpdateNotificationSettingsDto
	): Promise<NotificationSettingsDto> {
		const changes = this.changes(dto)
		const now = Date.now()

		const row = await this.prisma.notificationSettings.upsert({
			where: { userId },
			create: { userId, ...DEFAULT_SETTINGS, ...changes, updatedAt: now },
			update: { ...changes, updatedAt: now }
		})

		const settings = this.toDto(row)

		this.realtimeGateway.sendToUser(userId, SocketEvent.SETTINGS_NOTIFICATIONS, settings)

		return settings
	}

	/**
	 * Отсеивает тех, кто отключил уведомления для этой категории чатов.
	 *
	 * Спрашиваются только выключенные строки: у пользователя со включёнными
	 * уведомлениями строки в базе обычно нет вовсе.
	 *
	 * Ошибка базы не отменяет доставку: потерянное сообщение хуже лишнего
	 * уведомления, тем более что клиент проверяет настройку ещё раз перед показом.
	 */
	async filterPushRecipients(userIds: UserId[], chatType: ChatType): Promise<UserId[]> {
		if (userIds.length === 0) return []

		const disabledWhere = this.disabledWhere(chatType)
		if (!disabledWhere) return userIds

		try {
			const disabled = await this.prisma.notificationSettings.findMany({
				where: { userId: { in: userIds }, ...disabledWhere },
				select: { userId: true }
			})

			if (disabled.length === 0) return userIds

			const blocked = new Set(disabled.map((row) => row.userId.toString()))

			return userIds.filter((userId) => !blocked.has(userId.toString()))
		} catch (e) {
			this.logger.error('Error filtering push recipients', e)
			return userIds
		}
	}

	/**
	 * Условие «категория этого чата выключена».
	 *
	 * null означает неизвестный тип чата: фильтровать нечего, уведомление
	 * уходит всем.
	 */
	private disabledWhere(chatType: ChatType): Prisma.NotificationSettingsWhereInput | null {
		switch (chatType) {
			case ChatType.PRIVATE:
				return { privateChats: false }
			case ChatType.GROUP:
				return { groups: false }
			case ChatType.CHANNEL:
				return { channels: false }
			default:
				return null
		}
	}

	private changes(dto: UpdateNotificationSettingsDto): Partial<SettingsRow> {
		const data: Partial<SettingsRow> = {}

		if (dto.privateChats !== undefined) data.privateChats = dto.privateChats
		if (dto.groups !== undefined) data.groups = dto.groups
		if (dto.channels !== undefined) data.channels = dto.channels

		return data
	}

	private toDto(row: SettingsRow): NotificationSettingsDto {
		return plainToInstance(NotificationSettingsDto, {
			privateChats: row.privateChats,
			groups: row.groups,
			channels: row.channels
		})
	}
}

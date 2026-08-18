import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SocketEvent } from '../../common/socket/socket-events'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { Prisma } from '../../generated/prisma/client'
import { NotificationSettingsDto } from './dto/notification-settings.dto'
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto'
import { ChatNotificationSettingDto } from './dto/chat-notification-setting.dto'

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
		/*
		 * forwardRef разрывает кольцо импортов: шлюз тянет ChatsService, а тот
		 * теперь — эти настройки, чтобы отдать isMuted в списке чатов. Без
		 * отложенной ссылки класс шлюза на момент разбора конструктора ещё
		 * undefined, и Nest падает на старте. Сам шлюз так же держит ChatsService.
		 */
		@Inject(forwardRef(() => RealtimeGateway))
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
	 * Исключения пользователя: чаты, у которых уведомления отличаются от их
	 * категории или просто были переключены руками.
	 *
	 * Свежие сверху: на будущем экране исключений нужен именно тот чат, который
	 * только что выключили.
	 */
	async getChatSettings(userId: UserId): Promise<ChatNotificationSettingDto[]> {
		const rows = await this.prisma.chatNotificationSetting.findMany({
			where: { userId },
			orderBy: { updatedAt: 'desc' }
		})

		return rows.map((row) => this.toChatDto(row.chatId, row.enabled))
	}

	/**
	 * Кнопка «Выключить уведомления» в самом чате.
	 *
	 * Строка заводится всегда, даже когда значение совпало с категорией: чат
	 * попал в исключения осознанно и не должен молча уехать вслед за категорией,
	 * когда её переключат на экране настроек.
	 */
	async setChatSetting(
		userId: UserId,
		chatId: ChatId,
		enabled: boolean
	): Promise<ChatNotificationSettingDto> {
		const now = Date.now()

		const row = await this.prisma.chatNotificationSetting.upsert({
			where: { userId_chatId: { userId, chatId } },
			create: { userId, chatId, enabled, updatedAt: now },
			update: { enabled, updatedAt: now }
		})

		const setting = this.toChatDto(row.chatId, row.enabled)

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_NOTIFICATIONS, setting)

		return setting
	}

	/**
	 * Убрать чат из исключений.
	 *
	 * В событие уезжает уже действующее значение, а не сам факт удаления: для
	 * колокольчика в списке чатов важно итоговое состояние, а оно теперь
	 * приходит из категории.
	 */
	async deleteChatSetting(userId: UserId, chatId: ChatId): Promise<void> {
		await this.prisma.chatNotificationSetting.deleteMany({ where: { userId, chatId } })

		const enabled = await this.isChatEnabled(userId, chatId)

		this.realtimeGateway.sendToUser(
			userId,
			SocketEvent.CHAT_NOTIFICATIONS,
			this.toChatDto(chatId, enabled)
		)
	}

	/**
	 * Снять исключения разом.
	 *
	 * Затронутые чаты читаем до удаления: после него каждый снова следует своей
	 * категории, и это итоговое состояние уходит теми же событиями на чат, что и
	 * одиночное удаление, — чтобы колокольчик в списке чатов обновился на всех
	 * устройствах.
	 *
	 * category сужает набор до одной категории: экран исключений работает по
	 * категориям, и его «Удалить все» не должно трогать чужие.
	 */
	async deleteAllChatSettings(userId: UserId, category?: string): Promise<void> {
		const chatType = this.categoryToChatType(category)

		const rows = await this.prisma.chatNotificationSetting.findMany({
			where: { userId },
			select: { chatId: true }
		})

		const targets = chatType
			? rows.filter((row) => detectChatType(ChatId(row.chatId)) === chatType)
			: rows

		if (targets.length === 0) return

		const chatIds = targets.map((row) => row.chatId)

		await this.prisma.chatNotificationSetting.deleteMany({
			where: { userId, chatId: { in: chatIds } }
		})

		const settings = await this.prisma.notificationSettings.findUnique({ where: { userId } })

		for (const chatId of chatIds) {
			const enabled = this.categoryEnabled(
				settings ?? DEFAULT_SETTINGS,
				detectChatType(ChatId(chatId))
			)

			this.realtimeGateway.sendToUser(
				userId,
				SocketEvent.CHAT_NOTIFICATIONS,
				this.toChatDto(chatId, enabled)
			)
		}
	}

	/** Действующая настройка одного чата: исключение, иначе его категория. */
	async isChatEnabled(userId: UserId, chatId: ChatId): Promise<boolean> {
		const [settings, override] = await Promise.all([
			this.prisma.notificationSettings.findUnique({ where: { userId } }),
			this.prisma.chatNotificationSetting.findUnique({
				where: { userId_chatId: { userId, chatId } },
				select: { enabled: true }
			})
		])

		if (override) return override.enabled

		return this.categoryEnabled(settings ?? DEFAULT_SETTINGS, detectChatType(chatId))
	}

	/**
	 * Чаты с выключенными уведомлениями: перечёркнутый колокольчик в списке чатов.
	 *
	 * Обе таблицы читаются один раз на весь список: исключений у пользователя
	 * единицы, а отдельный запрос на каждый чат превратил бы список чатов
	 * в десятки запросов.
	 */
	async getMutedChatIds(userId: UserId, chatIds: bigint[]): Promise<Set<string>> {
		const muted = new Set<string>()

		if (chatIds.length === 0) return muted

		const [settings, overrides] = await Promise.all([
			this.prisma.notificationSettings.findUnique({ where: { userId } }),
			this.prisma.chatNotificationSetting.findMany({
				where: { userId, chatId: { in: chatIds } },
				select: { chatId: true, enabled: true }
			})
		])

		const overridden = new Map(overrides.map((row) => [row.chatId.toString(), row.enabled]))

		for (const chatId of chatIds) {
			const key = chatId.toString()
			const override = overridden.get(key)

			const enabled =
				override ??
				this.categoryEnabled(settings ?? DEFAULT_SETTINGS, detectChatType(ChatId(chatId)))

			if (!enabled) muted.add(key)
		}

		return muted
	}

	/**
	 * Отсеивает тех, кому это уведомление показывать не нужно.
	 *
	 * Исключение по самому чату сильнее категории: канал, включённый руками,
	 * звучит и при выключенных каналах — иначе список исключений не имел бы смысла.
	 *
	 * Ошибка базы не отменяет доставку: потерянное сообщение хуже лишнего
	 * уведомления, тем более что клиент проверяет настройку ещё раз перед показом.
	 */
	async filterPushRecipients(
		userIds: UserId[],
		chatType: ChatType,
		chatId?: ChatId
	): Promise<UserId[]> {
		if (userIds.length === 0) return []

		const disabledWhere = this.disabledWhere(chatType)

		try {
			const disabledQuery = disabledWhere
				? this.prisma.notificationSettings.findMany({
						where: { userId: { in: userIds }, ...disabledWhere },
						select: { userId: true }
					})
				: Promise.resolve<{ userId: bigint }[]>([])

			const overrideQuery = chatId
				? this.prisma.chatNotificationSetting.findMany({
						where: { userId: { in: userIds }, chatId },
						select: { userId: true, enabled: true }
					})
				: Promise.resolve<{ userId: bigint; enabled: boolean }[]>([])

			const [disabled, overrides] = await Promise.all([disabledQuery, overrideQuery])

			if (disabled.length === 0 && overrides.length === 0) return userIds

			const blocked = new Set(disabled.map((row) => row.userId.toString()))
			const overridden = new Map(overrides.map((row) => [row.userId.toString(), row.enabled]))

			return userIds.filter((userId) => {
				const key = userId.toString()

				return overridden.get(key) ?? !blocked.has(key)
			})
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

	/** Правило категории для этого типа чата: то, что перекрывает исключение. */
	private categoryEnabled(settings: SettingsRow, chatType: ChatType): boolean {
		switch (chatType) {
			case ChatType.PRIVATE:
				return settings.privateChats
			case ChatType.GROUP:
				return settings.groups
			case ChatType.CHANNEL:
				return settings.channels
			default:
				return true
		}
	}

	/**
	 * Категория чатов с клиента в тип чата этого сервера.
	 *
	 * null — сузить нечем: снимаем все исключения пользователя.
	 */
	private categoryToChatType(category?: string): ChatType | null {
		switch (category) {
			case 'PRIVATE_CHATS':
				return ChatType.PRIVATE
			case 'GROUPS':
				return ChatType.GROUP
			case 'CHANNELS':
				return ChatType.CHANNEL
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

	private toChatDto(chatId: bigint, enabled: boolean): ChatNotificationSettingDto {
		return plainToInstance(ChatNotificationSettingDto, {
			chatId: chatId.toString(),
			enabled
		})
	}
}

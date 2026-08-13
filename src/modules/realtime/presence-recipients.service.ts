import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { PrivacyRule } from '../../generated/prisma/enums'
import { UserId } from '../../common/types/user-id.type'

/*
 * Список собеседников меняется редко, а запрашивался он на каждом подключении
 * и отключении сокета. На мобильной сети это десятки одинаковых запросов в базу
 * в минуту на одного пользователя.
 */
const PARTNERS_TTL_MS = 5 * 60_000
const MAX_CACHED_USERS = 10_000

@Injectable()
export class PresenceRecipientsService {
	private readonly partners = new Map<string, { expiresAt: number; userIds: string[] }>()

	/* Параллельные входы с нескольких устройств не должны дублировать запрос. */
	private readonly inFlight = new Map<string, Promise<string[]>>()

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Кому разрешено знать о статусе пользователя.
	 *
	 * Настройка приватности читается каждый раз и намеренно не кешируется: если
	 * человек только что выбрал "Никто", он не должен светиться ещё пять минут,
	 * пока не протухнет кеш. А вот сам список собеседников кешируется: его
	 * устаревание означает лишь то, что совсем свежий собеседник узнает о статусе из
	 * снапшота при следующем подключении.
	 */
	async resolve(userId: UserId): Promise<string[]> {
		const visible = await this.isPresenceVisible(userId)
		if (!visible) return []

		return this.loadPartners(userId)
	}

	invalidate(userId: UserId): void {
		this.partners.delete(userId.toString())
	}

	private async isPresenceVisible(userId: UserId): Promise<boolean> {
		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId },
			select: { lastSeen: true }
		})

		return (settings?.lastSeen ?? PrivacyRule.EVERYBODY) !== PrivacyRule.NOBODY
	}

	private loadPartners(userId: UserId): Promise<string[]> {
		const key = userId.toString()
		const cached = this.partners.get(key)
		if (cached && cached.expiresAt > Date.now()) {
			return Promise.resolve(cached.userIds)
		}

		const pending = this.inFlight.get(key)
		if (pending) return pending

		const request = this.fetchPartners(userId)
			.then((userIds) => {
				this.partners.set(key, { expiresAt: Date.now() + PARTNERS_TTL_MS, userIds })
				this.prune()
				return userIds
			})
			.finally(() => {
				this.inFlight.delete(key)
			})

		this.inFlight.set(key, request)
		return request
	}

	/*
	 * Собственный чат с собой (Избранное) из списка убирается: рассказывать
	 * пользователю о его же статусе незачем.
	 */
	private async fetchPartners(userId: UserId): Promise<string[]> {
		const chats = await this.prisma.chat.findMany({
			where: { userId },
			select: { chatId: true }
		})

		return chats.filter((chat) => chat.chatId !== userId).map((chat) => chat.chatId.toString())
	}

	private prune(): void {
		if (this.partners.size <= MAX_CACHED_USERS) return

		const now = Date.now()
		for (const [key, entry] of this.partners) {
			if (entry.expiresAt <= now) this.partners.delete(key)
		}
	}
}

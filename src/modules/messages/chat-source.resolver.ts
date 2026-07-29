import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { ChannelType, GroupType, PrivacyRule } from '../../generated/prisma/enums'
import { ForwardSourceAccess } from '../../common/enums/forward-source-access.enum'

export type ChatSourceInfo = {
	/** Имя пользователя / название группы или канала. */
	name: string
	access: ForwardSourceAccess
}

/** Ключ — chatId.toString(), т.к. BigInt нельзя сравнивать по ссылке в Map. */
export type ChatSourceMap = Map<string, ChatSourceInfo>

type RawId = bigint | number | string | null | undefined

/**
 * Резолвит название чата-источника и право его открыть.
 *
 * Используется для заголовка «Forwarded from» и для превью ответа на сообщение
 * из другого чата. Все запросы батчатся: на страницу истории — максимум шесть
 * запросов независимо от количества сообщений.
 *
 * Важно: права считаются на момент чтения, а не отправки.
 */
@Injectable()
export class ChatSourceResolver {
	constructor(private readonly prisma: PrismaService) {}

	async resolve(viewerId: UserId, rawIds: RawId[]): Promise<ChatSourceMap> {
		const map: ChatSourceMap = new Map()

		const unique = new Set<string>()
		for (const raw of rawIds) {
			if (raw === null || raw === undefined) continue
			unique.add(raw.toString())
		}
		if (unique.size === 0) return map

		const userIds: bigint[] = []
		const groupIds: bigint[] = []
		const channelIds: bigint[] = []

		for (const key of unique) {
			const id = BigInt(key)
			switch (detectChatType(ChatId(id))) {
				case ChatType.PRIVATE:
					userIds.push(id)
					break
				case ChatType.GROUP:
					groupIds.push(id)
					break
				case ChatType.CHANNEL:
					channelIds.push(id)
					break
				default:
					map.set(key, { name: '', access: ForwardSourceAccess.UNAVAILABLE })
			}
		}

		await Promise.all([
			this.resolveUsers(viewerId, userIds, map),
			this.resolveGroups(viewerId, groupIds, map),
			this.resolveChannels(viewerId, channelIds, map)
		])

		for (const key of unique) {
			if (!map.has(key)) {
				map.set(key, { name: '', access: ForwardSourceAccess.UNAVAILABLE })
			}
		}

		return map
	}

	/** Удобная обёртка для одиночного источника (отправка, пересылка). */
	async resolveOne(viewerId: UserId, rawId: RawId): Promise<ChatSourceInfo | undefined> {
		if (rawId === null || rawId === undefined) return undefined
		const map = await this.resolve(viewerId, [rawId])
		return map.get(rawId.toString())
	}

	private async resolveUsers(viewerId: UserId, ids: bigint[], map: ChatSourceMap): Promise<void> {
		if (ids.length === 0) return

		const users = await this.prisma.user.findMany({
			where: { id: { in: ids } },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				privacySettings: { select: { forwardedProfile: true } }
			}
		})

		for (const user of users) {
			const isSelf = user.id === viewerId
			const rule = user.privacySettings?.forwardedProfile ?? PrivacyRule.EVERYBODY
			const allowed = isSelf || rule === PrivacyRule.EVERYBODY

			map.set(user.id.toString(), {
				name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
				access: allowed ? ForwardSourceAccess.OPEN : ForwardSourceAccess.RESTRICTED
			})
		}
	}

	private async resolveGroups(viewerId: UserId, ids: bigint[], map: ChatSourceMap): Promise<void> {
		if (ids.length === 0) return

		const [groups, memberships] = await Promise.all([
			this.prisma.group.findMany({
				where: { id: { in: ids } },
				select: { id: true, name: true, groupType: true, ownerId: true }
			}),
			this.prisma.groupMember.findMany({
				where: { userId: viewerId, groupId: { in: ids } },
				select: { groupId: true }
			})
		])

		const joined = new Set(memberships.map((m) => m.groupId.toString()))

		for (const group of groups) {
			const key = group.id.toString()
			const allowed =
				group.groupType === GroupType.PUBLIC || group.ownerId === viewerId || joined.has(key)

			map.set(key, {
				name: group.name,
				access: allowed ? ForwardSourceAccess.OPEN : ForwardSourceAccess.RESTRICTED
			})
		}
	}

	private async resolveChannels(
		viewerId: UserId,
		ids: bigint[],
		map: ChatSourceMap
	): Promise<void> {
		if (ids.length === 0) return

		const [channels, subscriptions] = await Promise.all([
			this.prisma.channel.findMany({
				where: { id: { in: ids } },
				select: { id: true, name: true, channelType: true, ownerId: true }
			}),
			this.prisma.channelSubscriber.findMany({
				where: { userId: viewerId, channelId: { in: ids } },
				select: { channelId: true }
			})
		])

		const subscribed = new Set(subscriptions.map((s) => s.channelId.toString()))

		for (const channel of channels) {
			const key = channel.id.toString()
			const allowed =
				channel.channelType === ChannelType.PUBLIC ||
				channel.ownerId === viewerId ||
				subscribed.has(key)

			map.set(key, {
				name: channel.name,
				access: allowed ? ForwardSourceAccess.OPEN : ForwardSourceAccess.RESTRICTED
			})
		}
	}
}

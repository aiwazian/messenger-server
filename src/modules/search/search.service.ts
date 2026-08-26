import { Injectable, NotFoundException } from '@nestjs/common'
import { SearchResponseDto } from './dto/search-response.dto'
import { plainToInstance } from 'class-transformer'
import { SearchQueryDto } from './dto/search-query.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChatId } from '../../common/types/chat-id.type'
import { ChannelType, GroupType } from '../../generated/prisma/enums'
import { ContentModerationService } from '../security/content-moderation.service'
import { ConfigService } from '@nestjs/config'

type SearchCandidate = {
	chatId: string
	name: string
	username: string | null
	rank: number
	usernameLength: number
	typePriority: number
}

@Injectable()
export class SearchService {
	/** Максимальное число кандидатов, которое ранжируется в памяти. */
	private static readonly MAX_CANDIDATES = 200

	/** Запас кандидатов сверх запрошенной страницы. */
	private static readonly OVERFETCH = 20

	/** Приоритет типа чата при одинаковой релевантности. */
	private static readonly TYPE_PRIORITY = {
		USER: 1,
		CHANNEL: 2,
		GROUP: 3
	}

	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
		private readonly moderation: ContentModerationService
	) {}

	async isUsernameAvailable(username: string): Promise<{ available: boolean }> {
		if (this.config.get('NODE_ENV') === 'production') {
			const isAllowed = await this.moderation.isAllowed(username)
			if (!isAllowed) return { available: false }
		}

		const userExists = await this.prisma.user.findFirst({
			where: { username },
			select: { id: true }
		})
		if (userExists) return { available: false }

		const groupExists = await this.prisma.group.findFirst({
			where: { username },
			select: { id: true }
		})
		if (groupExists) return { available: false }

		const channelExists = await this.prisma.channel.findFirst({
			where: { username },
			select: { id: true }
		})
		if (channelExists) return { available: false }

		return { available: true }
	}

	async resolveUsername(
		username: string,
		userId: bigint
	): Promise<{ chatId: bigint; isBanned: boolean } | null> {
		const userExists = await this.prisma.user.findFirst({
			where: { username },
			select: { id: true }
		})
		if (userExists) return { chatId: userExists.id, isBanned: false }

		const groupExists = await this.prisma.group.findFirst({
			where: { username },
			select: {
				id: true,
				blocked: {
					where: { userId }
				}
			}
		})
		if (groupExists) {
			return {
				chatId: groupExists.id,
				isBanned: groupExists.blocked.length > 0
			}
		}

		const channelExists = await this.prisma.channel.findFirst({
			where: { username },
			select: {
				id: true,
				blockedUsers: {
					where: { userId }
				}
			}
		})
		if (channelExists) {
			return {
				chatId: channelExists.id,
				isBanned: channelExists.blockedUsers.length > 0
			}
		}

		throw new NotFoundException('Chat not found')
	}

	async search(dto: SearchQueryDto, userId: bigint): Promise<SearchResponseDto[]> {
		const query = SearchService.normalizeQuery(dto.q)
		const limit = dto.limit
		const offset = dto.offset

		if (!query) return []

		// Кандидатов забираем с запасом и без skip: limit/offset применяются только
		// после ранжирования, иначе лучшее совпадение может не попасть в страницу.
		const take = Math.min(
			offset + limit + SearchService.OVERFETCH,
			SearchService.MAX_CANDIDATES
		)

		const [users, channels, groups] = await Promise.all([
			this.prisma.user.findMany({
				where: {
					username: {
						contains: query,
						mode: 'insensitive'
					}
				},
				take,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					username: true
				}
			}),
			this.prisma.channel.findMany({
				where: {
					AND: [
						{
							username: {
								contains: query,
								mode: 'insensitive'
							}
						},
						{
							OR: [
								{ channelType: ChannelType.PUBLIC },
								{ ownerId: userId },
								{ subscribers: { some: { userId } } }
							]
						},
						{
							NOT: {
								blockedUsers: { some: { userId } }
							}
						}
					]
				},
				take,
				select: {
					id: true,
					name: true,
					username: true
				}
			}),
			this.prisma.group.findMany({
				where: {
					AND: [
						{
							username: {
								contains: query,
								mode: 'insensitive'
							}
						},
						{
							OR: [
								{ groupType: GroupType.PUBLIC },
								{ ownerId: userId },
								{ members: { some: { userId } } }
							]
						},
						{
							NOT: {
								blocked: { some: { userId } }
							}
						}
					]
				},
				take,
				select: {
					id: true,
					name: true,
					username: true
				}
			})
		])

		const candidates: SearchCandidate[] = [
			...users.map((user) =>
				SearchService.toCandidate(
					ChatId(user.id).toString(),
					`${user.firstName} ${user.lastName || ''}`.trim(),
					user.username,
					SearchService.TYPE_PRIORITY.USER,
					query
				)
			),
			...channels.map((channel) =>
				SearchService.toCandidate(
					ChatId(channel.id).toString(),
					channel.name,
					channel.username,
					SearchService.TYPE_PRIORITY.CHANNEL,
					query
				)
			),
			...groups.map((group) =>
				SearchService.toCandidate(
					ChatId(group.id).toString(),
					group.name,
					group.username,
					SearchService.TYPE_PRIORITY.GROUP,
					query
				)
			)
		]

		const page = candidates
			.sort(SearchService.compareCandidates)
			.slice(offset, offset + limit)
			.map((candidate) => ({
				chatId: candidate.chatId,
				name: candidate.name,
				username: candidate.username
			}))

		return plainToInstance(SearchResponseDto, page)
	}

	/**
	 * Поиск идёт только по @username, поэтому убираем ведущий «@»
	 * и символы шаблона LIKE, которые Prisma не экранирует.
	 */
	private static normalizeQuery(raw: string): string {
		return raw
			.trim()
			.replace(/^@+/, '')
			.replace(/[%\\]/g, '')
			.toLowerCase()
	}

	private static toCandidate(
		chatId: string,
		name: string,
		username: string | null,
		typePriority: number,
		query: string
	): SearchCandidate {
		const value = (username ?? '').toLowerCase()

		return {
			chatId,
			name,
			username,
			rank: SearchService.rankUsername(value, query),
			usernameLength: value.length,
			typePriority
		}
	}

	/**
	 * Чем меньше значение, тем выше результат в списке:
	 * 0 — полное совпадение юзернейма, 1 — совпадение с начала, 2 — вхождение внутри.
	 */
	private static rankUsername(username: string, query: string): number {
		if (username === query) return 0
		if (username.startsWith(query)) return 1
		return 2
	}

	/** Стабильный порядок: релевантность, затем длина юзернейма, тип, имя и chatId. */
	private static compareCandidates(a: SearchCandidate, b: SearchCandidate): number {
		return (
			a.rank - b.rank ||
			a.usernameLength - b.usernameLength ||
			a.typePriority - b.typePriority ||
			a.name.localeCompare(b.name) ||
			a.chatId.localeCompare(b.chatId)
		)
	}
}

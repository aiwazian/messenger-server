import { Injectable, NotFoundException } from '@nestjs/common'
import { SearchResponseDto } from './dto/search-response.dto'
import { plainToInstance } from 'class-transformer'
import { SearchQueryDto } from './dto/search-query.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChatId } from '../../common/types/chat-id.type'
import { ChannelType, GroupType } from '../../../generated/prisma/enums'
import { ContentModerationService } from '../security/content-moderation.service'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SearchService {
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
		const query = dto.q || ''
		const limit = dto.limit || 20
		const offset = dto.offset || 0

		const [users, channels, groups] = await Promise.all([
			this.prisma.user.findMany({
				where: { username: { contains: query } },
				take: limit,
				skip: offset,
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
							OR: [{ username: { contains: query } }]
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
				take: limit,
				skip: offset,
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
							OR: [{ username: { contains: query } }]
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
				take: limit,
				skip: offset,
				select: {
					id: true,
					name: true,
					username: true
				}
			})
		])

		const userResults: SearchResponseDto[] = users.map((user) => ({
			chatId: ChatId(user.id).toString(),
			name: `${user.firstName} ${user.lastName || ''}`.trim(),
			username: user.username
		}))

		const channelResults: SearchResponseDto[] = channels.map((channel) => ({
			chatId: ChatId(channel.id).toString(),
			name: channel.name,
			username: channel.username
		}))

		const groupResults: SearchResponseDto[] = groups.map((group) => ({
			chatId: ChatId(group.id).toString(),
			name: group.name,
			username: group.username
		}))

		const combined = [...userResults, ...channelResults, ...groupResults]

		return plainToInstance(SearchResponseDto, combined.slice(offset, offset + limit))
	}
}

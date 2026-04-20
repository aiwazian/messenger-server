import { Injectable } from '@nestjs/common'
import { SearchResponseDto, SearchResultType } from './dto/search-response.dto'
import { plainToInstance } from 'class-transformer'
import { SearchQueryDto, SearchType } from './dto/search-query.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChatId } from '../../common/types/chat-id.type'
import { ChannelType, GroupType } from '../../../generated/prisma/enums'

@Injectable()
export class SearchService {
	constructor(private readonly prisma: PrismaService) { }

	async isUsernameAvailable(username: string): Promise<boolean> {
		const [userCount, groupCount, channelCount] = await Promise.all([
			this.prisma.user.count({ where: { username } }),
			this.prisma.group.count({ where: { username } }),
			this.prisma.channel.count({ where: { username } })
		])

		return userCount === 0 && groupCount === 0 && channelCount === 0
	}

	async search(dto: SearchQueryDto, userId: bigint): Promise<SearchResponseDto[]> {
		if (dto.type === SearchType.FILES) {
			return this.searchFiles(dto, userId)
		} else {
			return this.searchChats(dto, userId)
		}
	}

	private async searchChats(dto: SearchQueryDto, userId: bigint): Promise<SearchResponseDto[]> {
		const query = dto.q || ''
		const limit = dto.limit || 20
		const offset = dto.offset || 0

		const [users, channels, groups] = await Promise.all([
			this.prisma.user.findMany({
				where: {
					OR: [
						{ firstName: { contains: query } },
						{ lastName: { contains: query } },
						{ username: { contains: query } }
					]
				},
				take: limit,
				skip: offset
			}),
			this.prisma.channel.findMany({
				where: {
					AND: [
						{
							OR: [{ name: { contains: query } }, { username: { contains: query } }]
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
				skip: offset
			}),
			this.prisma.group.findMany({
				where: {
					AND: [
						{
							OR: [{ name: { contains: query } }, { username: { contains: query } }]
						},
						{
							OR: [{ groupType: GroupType.PUBLIC }, { ownerId: userId }, { members: { some: { userId } } }]
						},
						{
							NOT: {
								blocked: { some: { userId } }
							}
						}
					]
				},
				take: limit,
				skip: offset
			})
		])

		const userResults: SearchResponseDto[] = users.map((user) => ({
			type: SearchResultType.CHAT,
			chatId: ChatId(user.id).toString(),
			name: `${user.firstName} ${user.lastName || ''}`.trim()
		}))

		const channelResults: SearchResponseDto[] = channels.map((channel) => ({
			type: SearchResultType.CHAT,
			chatId: ChatId(channel.id).toString(),
			name: channel.name
		}))

		const groupResults: SearchResponseDto[] = groups.map((group) => ({
			type: SearchResultType.CHAT,
			chatId: ChatId(group.id).toString(),
			name: group.name
		}))

		const combined = [...userResults, ...channelResults, ...groupResults]

		return plainToInstance(SearchResponseDto, combined.slice(0, limit))
	}

	private async searchFiles(dto: SearchQueryDto, userId: bigint): Promise<SearchResponseDto[]> {
		const query = dto.q || ''
		const limit = dto.limit || 20
		const offset = dto.offset || 0

		const userChats = await this.prisma.chat.findMany({
			where: { userId },
			select: { chatId: true }
		})
		const userChatIds = userChats.map((c) => c.chatId)

		const files = await this.prisma.file.findMany({
			where: {
				name: { contains: query },
				message: {
					chatId: { in: userChatIds }
				}
			},
			include: {
				message: {
					include: {
						sender: {
							select: {
								id: true,
								firstName: true,
								lastName: true
							}
						}
					}
				}
			},
			take: limit,
			skip: offset,
			orderBy: {
				createdAt: 'desc'
			}
		})

		const results: SearchResponseDto[] = files.map((file) => {
			const message = file.message
			const senderName = message?.sender
				? `${message.sender.firstName ?? ''} ${message.sender.lastName ?? ''}`.trim()
				: 'Unknown'

			return {
				type: SearchResultType.FILE,
				chatId: ChatId(message?.chatId || 0n).toString(),
				name: file.name,
				fileId: file.id,
				size: file.size.toString(),
				mimeType: file.mimeType,
				messageId: message?.id.toString(),
				senderName,
				createdAt: file.createdAt.toString()
			}
		})

		return plainToInstance(SearchResponseDto, results)
	}
}

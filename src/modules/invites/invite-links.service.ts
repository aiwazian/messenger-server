import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { InviteLinkResponseDto } from './dto/invite-link-response.dto'
import { plainToInstance } from 'class-transformer'
import { InternalInviteLinkResponse } from './dto/Internal-invite-link-response'
import { CreateInviteLinkDto } from '../chats/dto/create-invite-link.dto'
import { ChatsService } from '../chats/chats.service'
import { ChannelInviteLink, GroupInviteLink } from '../../../generated/prisma/client'

@Injectable()
export class InviteLinksService {
	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService
	) {}

	async getInfo(userId: UserId, code: string): Promise<InternalInviteLinkResponse> {
		let link: ChannelInviteLink | GroupInviteLink | null =
			await this.prisma.channelInviteLink.findUnique({ where: { code } })
		let isChannel = true

		if (!link) {
			link = await this.prisma.groupInviteLink.findUnique({ where: { code } })
			isChannel = false
		}

		if (!link) {
			throw new NotFoundException('Invite link not found')
		}

		if (link.expiresAt && link.expiresAt < BigInt(Date.now())) {
			throw new BadRequestException('Invite link expired')
		}

		if (link.maxUses && link.uses >= link.maxUses) {
			throw new BadRequestException('Invite link limit reached')
		}

		const chatId = isChannel
			? (link as ChannelInviteLink).channelId
			: (link as GroupInviteLink).groupId
		let name = ''
		let description = ''
		let membersCount = 0

		if (isChannel) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: chatId }
			})
			if (!channel) throw new NotFoundException('Channel not found')

			const isBanned = !!(await this.prisma.channelBlackList.findFirst({
				where: { channelId: channel.id, userId }
			}))

			if (isBanned) {
				return plainToInstance(InternalInviteLinkResponse, {
					chatId: channel.id,
					isBanned: true
				})
			}

			const isJoined = !!(await this.prisma.channelSubscriber.findFirst({
				where: { channelId: channel.id, userId }
			}))

			if (isJoined) {
				return plainToInstance(InternalInviteLinkResponse, {
					chatId: channel.id,
					isJoined: true
				})
			}

			name = channel.name
			description = channel.bio || ''
			membersCount = await this.prisma.channelSubscriber.count({
				where: { channelId: channel.id }
			})
		} else {
			const group = await this.prisma.group.findUnique({
				where: { id: chatId }
			})
			if (!group) throw new NotFoundException('Group not found')

			const isBanned = !!(await this.prisma.groupBlackList.findFirst({
				where: { groupId: group.id, userId }
			}))

			if (isBanned) {
				return plainToInstance(InternalInviteLinkResponse, {
					chatId: group.id,
					isBanned: true
				})
			}

			const isJoined = !!(await this.prisma.groupMember.findFirst({
				where: { groupId: group.id, userId }
			}))

			if (isJoined) {
				return plainToInstance(InternalInviteLinkResponse, {
					chatId: group.id,
					isJoined: true
				})
			}

			name = group.name
			description = group.bio || ''
			membersCount = await this.prisma.groupMember.count({
				where: { groupId: group.id }
			})
		}

		return plainToInstance(InternalInviteLinkResponse, {
			chatId: chatId,
			name,
			description,
			membersCount
		})
	}

	async join(userId: UserId, code: string) {
		let link: ChannelInviteLink | GroupInviteLink | null =
			await this.prisma.channelInviteLink.findUnique({ where: { code } })
		let isChannel = true

		if (!link) {
			link = await this.prisma.groupInviteLink.findUnique({ where: { code } })
			isChannel = false
		}

		if (!link) {
			throw new NotFoundException('Invite link not found or expired')
		}

		if (link.expiresAt && link.expiresAt < BigInt(Date.now())) {
			if (isChannel) await this.prisma.channelInviteLink.delete({ where: { id: link.id } })
			else await this.prisma.groupInviteLink.delete({ where: { id: link.id } })
			throw new BadRequestException('Invite link expired')
		}

		if (link.maxUses && link.uses >= link.maxUses) {
			if (isChannel) await this.prisma.channelInviteLink.delete({ where: { id: link.id } })
			else await this.prisma.groupInviteLink.delete({ where: { id: link.id } })
			throw new BadRequestException('Invite link limit reached')
		}

		const chatId = isChannel
			? (link as ChannelInviteLink).channelId
			: (link as GroupInviteLink).groupId

		if (!isChannel) {
			const isBanned = await this.prisma.groupBlackList.count({
				where: { groupId: chatId, userId }
			})
			if (isBanned) throw new BadRequestException('You are banned from this group')
		} else {
			const isBanned = await this.prisma.channelBlackList.count({
				where: { channelId: chatId, userId }
			})
			if (isBanned) throw new BadRequestException('You are banned from this channel')
		}

		const existingChat = await this.chatsService.exists(userId, ChatId(chatId))

		if (existingChat) return link

		if (!isChannel) {
			await this.prisma.groupMember.create({
				data: { groupId: chatId, userId }
			})
		} else {
			await this.prisma.channelSubscriber.create({
				data: { channelId: chatId, userId }
			})
		}

		await this.chatsService.create(userId, ChatId(chatId))

		let updatedLink: ChannelInviteLink | GroupInviteLink | null = null
		if (isChannel) {
			updatedLink = await this.prisma.channelInviteLink.update({
				where: { id: link.id },
				data: { uses: { increment: 1 } }
			})
			if (updatedLink.maxUses && updatedLink.uses >= updatedLink.maxUses) {
				await this.prisma.channelInviteLink.delete({ where: { id: link.id } })
			}
		} else {
			updatedLink = await this.prisma.groupInviteLink.update({
				where: { id: link.id },
				data: { uses: { increment: 1 } }
			})
			if (updatedLink.maxUses && updatedLink.uses >= updatedLink.maxUses) {
				await this.prisma.groupInviteLink.delete({ where: { id: link.id } })
			}
		}

		return link
	}

	async getByChatId(chatId: ChatId): Promise<InviteLinkResponseDto[]> {
		const chatType = detectChatType(chatId)
		let links: (ChannelInviteLink | GroupInviteLink)[] = []

		if (chatType === ChatType.CHANNEL) {
			links = await this.prisma.channelInviteLink.findMany({ where: { channelId: chatId } })
		} else if (chatType === ChatType.GROUP) {
			links = await this.prisma.groupInviteLink.findMany({ where: { groupId: chatId } })
		}

		const domain = this.config.get('SHORT_URL_DOMAIN')

		const mappedLinks = links.map((link) => ({
			...link,
			chatId: chatId,
			link: `https://${domain}/+${link.code}`
		}))

		return plainToInstance(InviteLinkResponseDto, mappedLinks)
	}

	async getLinkForChannel(channelId: bigint): Promise<string | null> {
		const link = await this.prisma.channelInviteLink.findFirst({
			where: { channelId: channelId },
			orderBy: { id: 'asc' },
			take: 1
		})
		return link ? link.code : null
	}

	async delete(id: number) {
		const channelLink = await this.prisma.channelInviteLink.findUnique({ where: { id } })
		if (channelLink) {
			await this.prisma.channelInviteLink.delete({ where: { id } })
			return
		}

		const groupLink = await this.prisma.groupInviteLink.findUnique({ where: { id } })
		if (groupLink) {
			await this.prisma.groupInviteLink.delete({ where: { id } })
		}
	}
}

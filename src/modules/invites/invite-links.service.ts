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

@Injectable()
export class InviteLinksService {
	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService
	) { }

	async create(creatorId: UserId, chatId: ChatId, dto: CreateInviteLinkDto): Promise<InviteLinkResponseDto> {
		const code = randomBytes(8).toString('hex')
		const expiresAt = dto.expiresInSeconds ? BigInt(Date.now() + dto.expiresInSeconds * 1000) : null

		const link = await this.prisma.inviteLink.create({
			data: {
				code: code,
				chatId: chatId,
				creatorId: creatorId,
				maxUses: dto.maxUses,
				expiresAt: expiresAt
			}
		})

		return plainToInstance(InviteLinkResponseDto, {
			...link,
			link: `https://${this.config.get('SHORT_URL_DOMAIN')}/+${link.code}`,
		})
	}

	async getInfo(userId: UserId, code: string): Promise<InternalInviteLinkResponse> {
		const link = await this.prisma.inviteLink.findUnique({
			where: { code }
		})

		if (!link) {
			throw new NotFoundException('Invite link not found')
		}

		if (link.expiresAt && link.expiresAt < BigInt(Date.now())) {
			throw new BadRequestException('Invite link expired')
		}

		if (link.maxUses && link.uses >= link.maxUses) {
			throw new BadRequestException('Invite link limit reached')
		}

		const chatType = detectChatType(ChatId(link.chatId))

		let name = ''
		let description = ''
		let membersCount = 0

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: link.chatId }
			})
			if (!channel) throw new NotFoundException('Channel not found')

			const isBanned = !!await this.prisma.channelBlackList.findFirst({
				where: { channelId: channel.id, userId }
			})

			if (isBanned) {
				return plainToInstance(InternalInviteLinkResponse, {
					chatId: channel.id,
					isBanned: true
				})
			}

			const isJoined = !!await this.prisma.channelSubscriber.findFirst({
				where: { channelId: channel.id, userId }
			})

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
		} else if (chatType === ChatType.GROUP) {
			const group = await this.prisma.group.findUnique({
				where: { id: link.chatId }
			})
			if (!group) throw new NotFoundException('Group not found')

			const isBanned = !!await this.prisma.groupBlackList.findFirst({
				where: { groupId: group.id, userId }
			})

			if (isBanned) {
				return plainToInstance(InternalInviteLinkResponse, {
					chatId: group.id,
					isBanned: true
				})
			}

			const isJoined = !!await this.prisma.groupMember.findFirst({
				where: { groupId: group.id, userId }
			})

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
			chatId: link.chatId,
			name,
			description,
			membersCount
		})
	}

	async join(userId: UserId, code: string) {
		const link = await this.prisma.inviteLink.findUnique({
			where: { code }
		})

		if (!link) {
			throw new NotFoundException('Invite link not found or expired')
		}

		if (link.expiresAt && link.expiresAt < BigInt(Date.now())) {
			await this.prisma.inviteLink.delete({ where: { id: link.id } })
			throw new BadRequestException('Invite link expired')
		}

		if (link.maxUses && link.uses >= link.maxUses) {
			await this.prisma.inviteLink.delete({ where: { id: link.id } })
			throw new BadRequestException('Invite link limit reached')
		}

		const chatType = detectChatType(ChatId(link.chatId))

		if (chatType === ChatType.GROUP) {
			const isBanned = await this.prisma.groupBlackList.count({
				where: { groupId: link.chatId, userId }
			})
			if (isBanned) throw new BadRequestException('You are banned from this group')
		} else if (chatType === ChatType.CHANNEL) {
			const isBanned = await this.prisma.channelBlackList.count({
				where: { channelId: link.chatId, userId }
			})
			if (isBanned) throw new BadRequestException('You are banned from this channel')
		}

		const existingChat = await this.prisma.chat.findUnique({
			where: { userId_chatId: { userId, chatId: link.chatId } }
		})

		if (existingChat) return link

		await this.prisma.$transaction(async (tx) => {
			if (chatType === ChatType.GROUP) {
				await tx.groupMember.create({
					data: { groupId: link.chatId, userId }
				})
			} else if (chatType === ChatType.CHANNEL) {
				await tx.channelSubscriber.create({
					data: { channelId: link.chatId, userId }
				})
			}

			await tx.chat.create({
				data: {
					userId,
					chatId: link.chatId,
					createdAt: Date.now()
				}
			})

			const updatedLink = await tx.inviteLink.update({
				where: { id: link.id },
				data: { uses: { increment: 1 } }
			})

			if (updatedLink.maxUses && updatedLink.uses >= updatedLink.maxUses) {
				await tx.inviteLink.delete({ where: { id: link.id } })
			}
		})

		return link
	}

	async getByChatId(chatId: ChatId): Promise<InviteLinkResponseDto[]> {
		const links = await this.prisma.inviteLink.findMany({
			where: { chatId }
		})

		const domain = this.config.get('SHORT_URL_DOMAIN')

		const mappedLinks = links.map((link: any) => ({
			...link,
			link: `https://${domain}/+${link.code}`
		}))

		return plainToInstance(InviteLinkResponseDto, mappedLinks)
	}

	async getLinkForChannel(channelId: bigint): Promise<string | null> {
		const link = await this.prisma.inviteLink.findFirst({
			where: { chatId: channelId },
			orderBy: { id: 'asc' },
			take: 1
		})
		return link?.code ?? null
	}

	async delete(id: number) {
		await this.prisma.inviteLink.delete({ where: { id: id } })
	}
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CreateInviteLinkDto } from './dto/create-invite-link.dto'
import { randomBytes } from 'crypto'
import { ChatsService } from './chats.service'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { generateInviteLinkId } from '../../common/utils/id-generator.util'
import { ConversationType } from '../../../generated/prisma/enums'

export interface InternalInviteLinkResponse {
	id: bigint
	chatId: string
	code: string
	link: string
	expiresAt: bigint | null
	maxUses: number | null
	uses: number
}

@Injectable()
export class InviteLinksService {
	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService
	) { }

	async create(creatorId: UserId, dto: CreateInviteLinkDto): Promise<InternalInviteLinkResponse> {
		const conversation = await this.prisma.conversation.findUnique({
			where: dto.channelId ? { channelId: BigInt(dto.channelId) } : { groupId: BigInt(dto.groupId) }
		})

		if (!conversation) {
			throw new NotFoundException(`${dto.channelId ? 'Channel' : 'Group'} conversation not found`)
		}

		const conversationId = conversation.id

		const id = generateInviteLinkId()
		const code = randomBytes(8).toString('hex')

		const expiresAt = dto.expiresInSeconds ? BigInt(Date.now() + dto.expiresInSeconds * 1000) : null

		const link = await this.prisma.inviteLink.create({
			data: {
				id,
				code,
				conversationId,
				creatorId,
				maxUses: dto.maxUses,
				expiresAt
			}
		})

		const chatId = (conversation.channelId || conversation.groupId)?.toString() || ''

		return {
			id: link.id,
			chatId,
			code: link.code,
			link: `https://${this.config.get('SHORT_URL_DOMAIN')}/+${link.code}`,
			expiresAt: link.expiresAt,
			maxUses: link.maxUses,
			uses: link.uses
		}
	}

	async getInfo(userId: UserId, code: string) {
		const link = await this.prisma.inviteLink.findUnique({
			where: { code },
			include: { conversation: true }
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

		const { conversation } = link

		let name = ''
		let description = ''
		let membersCount = 0
		let isBanned = false
		let isJoined = false
		let type = conversation.type

		if (conversation.type === ConversationType.CHANNEL && conversation.channelId) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: conversation.channelId }
			})
			if (!channel) throw new NotFoundException('Channel not found')

			name = channel.name
			description = channel.bio || ''
			membersCount = await this.prisma.channelSubscriber.count({
				where: { channelId: channel.id }
			})
			isBanned = await this.prisma.channelBlackList.count({
				where: { channelId: channel.id, userId }
			}) > 0
			isJoined = await this.prisma.channelSubscriber.count({
				where: { channelId: channel.id, userId }
			}) > 0
		} else if (conversation.type === ConversationType.GROUP && conversation.groupId) {
			const group = await this.prisma.group.findUnique({
				where: { id: conversation.groupId }
			})
			if (!group) throw new NotFoundException('Group not found')

			name = group.name
			description = group.bio || ''
			membersCount = await this.prisma.groupMember.count({
				where: { groupId: group.id }
			})
			isBanned = await this.prisma.groupBlackList.count({
				where: { groupId: group.id, userId }
			}) > 0
			isJoined = await this.prisma.groupMember.count({
				where: { groupId: group.id, userId }
			}) > 0
		}

		return {
			chatId: (conversation.channelId || conversation.groupId)?.toString(),
			name,
			description,
			membersCount,
			isBanned,
			isJoined,
			type
		}
	}

	async join(userId: UserId, code: string) {
		const link = await this.prisma.inviteLink.findUnique({
			where: { code },
			include: { conversation: true }
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

		const { conversation } = link

		if (conversation.type === ConversationType.GROUP && conversation.groupId) {
			const isBanned = await this.prisma.groupBlackList.count({
				where: { groupId: conversation.groupId, userId }
			})
			if (isBanned) throw new BadRequestException('You are banned from this group')
		} else if (conversation.type === ConversationType.CHANNEL && conversation.channelId) {
			const isBanned = await this.prisma.channelBlackList.count({
				where: { channelId: conversation.channelId, userId }
			})
			if (isBanned) throw new BadRequestException('You are banned from this channel')
		}

		const existingMember = await this.prisma.conversationMember.findUnique({
			where: { conversationId_userId: { conversationId: conversation.id, userId } }
		})

		if (existingMember) return conversation

		await this.prisma.$transaction(async (tx) => {
			if (conversation.type === ConversationType.GROUP && conversation.groupId) {
				await tx.groupMember.create({
					data: { groupId: conversation.groupId, userId }
				})
			} else if (conversation.type === ConversationType.CHANNEL && conversation.channelId) {
				await tx.channelSubscriber.create({
					data: { channelId: conversation.channelId, userId }
				})
			}

			await tx.conversationMember.create({
				data: {
					conversationId: conversation.id,
					userId,
					joinedAt: Date.now()
				}
			})

			await this.chatsService.create(tx, userId, conversation.id)

			const updatedLink = await tx.inviteLink.update({
				where: { id: link.id },
				data: { uses: { increment: 1 } }
			})

			if (updatedLink.maxUses && updatedLink.uses >= updatedLink.maxUses) {
				await tx.inviteLink.delete({ where: { id: link.id } })
			}
		})

		return conversation
	}

	async getByConversation(conversationId: number) {
		return await this.prisma.inviteLink.findMany({
			where: { conversationId }
		})
	}

	async delete(id: bigint) {
		await this.prisma.inviteLink.delete({ where: { id } })
	}

	getShortUrlDomain() {
		return this.config.get('SHORT_URL_DOMAIN')
	}
}

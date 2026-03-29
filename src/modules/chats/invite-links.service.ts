import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { UserId } from 'src/common/types/user-id.type'
import { CreateInviteLinkDto } from './dto/create-invite-link.dto'
import { randomBytes } from 'crypto'
import { generateInviteLinkId } from 'src/common/utils/id-generator.util'
import { ConversationType } from 'generated/prisma/client'
import { ChatsService } from './chats.service'
import { ConfigService } from '@nestjs/config'

export interface InternalInviteLinkResponse {
	id: bigint
	chatId: string
	code: string
	link: string
	expiresAt: bigint | null
	isPermanent: boolean
	maxUses: number | null
	uses: number
}

@Injectable()
export class InviteLinksService {
	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService
	) {}

	async create(creatorId: UserId, dto: CreateInviteLinkDto): Promise<InternalInviteLinkResponse> {
		const conversation = await this.prisma.conversation.findUnique({
			where: dto.channelId ? { channelId: BigInt(dto.channelId) } : { groupId: BigInt(dto.groupId) }
		})

		if (!conversation) {
			throw new NotFoundException(`${dto.channelId ? 'Channel' : 'Group'} conversation not found`)
		}

		const conversationId = conversation.id

		await this.prisma.inviteLink.deleteMany({
			where: { conversationId }
		})

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
			isPermanent: link.expiresAt === null && (link.maxUses === null || link.maxUses === 0),
			maxUses: link.maxUses,
			uses: link.uses
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
}

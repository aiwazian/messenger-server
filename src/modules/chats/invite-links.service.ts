import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CreateInviteLinkDto } from './dto/create-invite-link.dto'
import { randomBytes } from 'crypto'
import { ChatsService } from './chats.service'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { generateInviteLinkId } from '../../common/utils/id-generator.util'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'

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
	) {}

	async create(creatorId: UserId, dto: CreateInviteLinkDto): Promise<InternalInviteLinkResponse> {
		const chatId = dto.channelId ? ChatId(dto.channelId) : ChatId(dto.groupId)

		const id = generateInviteLinkId()
		const code = randomBytes(8).toString('hex')
		const expiresAt = dto.expiresInSeconds ? BigInt(Date.now() + dto.expiresInSeconds * 1000) : null

		const link = await this.prisma.inviteLink.create({
			data: {
				id,
				code,
				chatId,
				creatorId,
				maxUses: dto.maxUses,
				expiresAt
			}
		})

		return {
			id: link.id,
			chatId: chatId.toString(),
			code: link.code,
			link: `https://${this.config.get('SHORT_URL_DOMAIN')}/+${link.code}`,
			expiresAt: link.expiresAt,
			maxUses: link.maxUses,
			uses: link.uses
		}
	}

	async getInfo(userId: UserId, code: string) {
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
		let isBanned = false
		let isJoined = false

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: link.chatId }
			})
			if (!channel) throw new NotFoundException('Channel not found')

			name = channel.name
			description = channel.bio || ''
			membersCount = await this.prisma.channelSubscriber.count({
				where: { channelId: channel.id }
			})
			isBanned =
				(await this.prisma.channelBlackList.count({
					where: { channelId: channel.id, userId }
				})) > 0
			isJoined =
				(await this.prisma.channelSubscriber.count({
					where: { channelId: channel.id, userId }
				})) > 0
		} else if (chatType === ChatType.GROUP) {
			const group = await this.prisma.group.findUnique({
				where: { id: link.chatId }
			})
			if (!group) throw new NotFoundException('Group not found')

			name = group.name
			description = group.bio || ''
			membersCount = await this.prisma.groupMember.count({
				where: { groupId: group.id }
			})
			isBanned =
				(await this.prisma.groupBlackList.count({
					where: { groupId: group.id, userId }
				})) > 0
			isJoined =
				(await this.prisma.groupMember.count({
					where: { groupId: group.id, userId }
				})) > 0
		}

		return {
			chatId: link.chatId.toString(),
			name,
			description,
			membersCount,
			isBanned,
			isJoined,
			type: chatType
		}
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

	async getByChatId(chatId: bigint) {
		return await this.prisma.inviteLink.findMany({
			where: { chatId }
		})
	}

	async getLinkForChannel(channelId: bigint): Promise<string | null> {
		const link = await this.prisma.inviteLink.findFirst({
			where: { chatId: channelId },
			orderBy: { id: 'asc' },
			take: 1
		})
		return link?.code ?? null
	}

	async delete(id: bigint) {
		await this.prisma.inviteLink.delete({ where: { id } })
	}

	getShortUrlDomain() {
		return this.config.get('SHORT_URL_DOMAIN')
	}
}

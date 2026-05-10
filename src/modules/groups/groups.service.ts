import { plainToInstance } from 'class-transformer'
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { CreateGroupDto } from './dto/create-group.dto'
import { GroupResponseDto } from './dto/group-response.dto'
import { UpdateGroupDto } from './dto/update-group.dto'
import { ChatsService } from '../chats/chats.service'
import { SearchService } from '../search/search.service'
import { UserResponseDto } from '../users/dto/user-response.dto'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { generateGroupId } from '../../common/utils/id-generator.util'
import {
	GroupType,
	MessageType,
	PrivacyRule,
	SystemEventType
} from '../../../generated/prisma/enums'
import { GroupId } from '../../common/types/group-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { Prisma } from '../../../generated/prisma/client'
import { SocketEvent } from '../../common/socket/socket-events'
import { ChatResponseDto } from '../chats/dto/chat-response.dto'
import { EncryptionService } from '../encryption/encryption.service'
import { AddMembersDto } from './dto/add-members.dto'
import { randomBytes } from 'crypto'
import { CreateInviteLinkDto } from '../../common/dtos/create-invite-link.dto'
import { UpdateInviteLinkDto } from '../../common/dtos/update-invite-link.dto'
import { ConfigService } from '@nestjs/config'
import { InviteLinkResponseDto } from '../invites/dto/invite-link-response.dto'

@Injectable()
export class GroupsService {
	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService,
		private readonly searchService: SearchService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly encryption: EncryptionService
	) { }

	async create(ownerId: UserId, dto: CreateGroupDto): Promise<GroupResponseDto> {
		const groupId = generateGroupId()

		const group = await this.prisma.group.create({
			data: {
				id: groupId,
				name: dto.name,
				bio: dto.bio,
				ownerId: ownerId,
				groupType: GroupType.PRIVATE,
				username: null,
				members: {
					create: {
						userId: ownerId
					}
				}
			}
		})

		await this.chatsService.create(ownerId, ChatId(group.id))

		await this.prisma.message.create({
			data: {
				chatId: group.id,
				text: null,
				sendTime: Date.now(),
				sequenceId: BigInt(Date.now()),
				senderId: ownerId,
				messageType: MessageType.SYSTEM,
				encryptionKeyVersion: this.encryption.currentVersion,
				systemEvent: {
					create: {
						eventType: SystemEventType.GROUP_CREATED
					}
				}
			}
		})

		const chatPayload = plainToInstance(ChatResponseDto, {
			id: group.id,
			name: group.name,
			isPinned: false,
			lastMessage: null
		})

		this.realtimeGateway.sendToUser(ownerId, SocketEvent.CHAT_NEW, chatPayload)

		return plainToInstance(GroupResponseDto, {
			...group,
			isMember: true,
			isOwner: true,
			membersCount: 1
		})
	}

	async update(id: GroupId, dto: UpdateGroupDto): Promise<GroupResponseDto> {
		const existingGroup = await this.prisma.group.findUnique({ where: { id } })

		if (dto.username && dto.username !== existingGroup?.username) {
			const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
			if (!isAvailable) throw new ConflictException('Username is already taken')
		}

		const group = await this.prisma.group.update({
			where: { id },
			data: {
				name: dto.name,
				bio: dto.bio,
				username: dto.username,
				groupType: dto.groupType
			}
		})
		return plainToInstance(GroupResponseDto, group)
	}

	async join(id: GroupId, userId: UserId): Promise<void> {
		const group = await this.prisma.group.findUnique({ where: { id } })

		if (group?.groupType !== GroupType.PUBLIC) {
			throw new BadRequestException('This group is private. Use invite link to join.')
		}

		const isBanned = await this.prisma.groupBlackList.count({
			where: { groupId: id, userId }
		})
		if (isBanned) throw new BadRequestException('You are banned from this group')

		const existingMember = await this.prisma.groupMember.findUnique({
			where: { groupId_userId: { groupId: id, userId } }
		})
		if (existingMember) return

		await this.prisma.groupMember.create({ data: { groupId: id, userId } })
		await this.chatsService.create(userId, ChatId(id))
	}

	async leave(id: GroupId, userId: UserId): Promise<void> {
		const group = await this.prisma.group.findUnique({ where: { id } })
		if (group?.ownerId === userId)
			throw new BadRequestException('Owner cannot leave group. Delete it instead.')

		await this.prisma.$transaction(async (tx) => {
			await tx.groupMember
				.delete({ where: { groupId_userId: { groupId: id, userId } } })
				.catch(() => { })

			await tx.chat.deleteMany({
				where: { userId, chatId: id }
			})
		})

		this.realtimeGateway.sendToUser(userId, SocketEvent.CHAT_UPDATED, { chatId: id })
	}

	async kick(id: GroupId, ownerId: UserId, targetUserId: UserId): Promise<void> {
		if (targetUserId === ownerId) throw new BadRequestException('Cannot kick yourself')

		await this.leave(id, targetUserId)

		this.realtimeGateway.sendToUser(targetUserId, SocketEvent.CHAT_REMOVED, { chatId: id })
	}

	async ban(id: GroupId, ownerId: UserId, targetUserId: UserId): Promise<void> {
		if (targetUserId === ownerId) throw new BadRequestException('Cannot ban yourself')

		const group = await this.prisma.group.findUnique({ where: { id } })

		if (!group) throw new NotFoundException('Group not found')
		if (group.ownerId === targetUserId) {
			throw new BadRequestException('Owner cannot leave group. Delete it instead.')
		}

		await this.prisma.$transaction(async (tx) => {
			await tx.groupMember
				.delete({ where: { groupId_userId: { groupId: id, userId: targetUserId } } })
				.catch(() => { })

			await tx.chat.deleteMany({
				where: { userId: targetUserId, chatId: id }
			})

			await tx.groupBlackList.upsert({
				where: { userId_groupId: { userId: targetUserId, groupId: id } },
				create: { userId: targetUserId, groupId: id },
				update: {}
			})
		})

		this.realtimeGateway.sendToUser(targetUserId, SocketEvent.CHAT_REMOVED, { chatId: id })
	}

	async getById(id: GroupId, userId: UserId): Promise<GroupResponseDto> {
		const group = await this.prisma.group.findUnique({
			where: { id },
			include: {
				_count: { select: { members: true } },
				members: {
					where: { userId: userId },
					select: { userId: true }
				}
			}
		})

		if (!group) throw new NotFoundException('Group not found')

		const isMember = userId ? group.members.length > 0 : false
		const isOwner = userId ? group.ownerId === userId : false

		return plainToInstance(GroupResponseDto, {
			...group,
			membersCount: group._count.members,
			isMember,
			isOwner
		})
	}

	async getMembers(
		id: GroupId,
		skip: number,
		take: number,
		search?: string
	): Promise<UserResponseDto[]> {
		const where: Prisma.GroupMemberWhereInput = {
			groupId: id,
			user: search
				? {
					OR: [
						{ firstName: { contains: search } },
						{ lastName: { contains: search } },
						{ username: { contains: search } }
					]
				}
				: undefined
		}

		const members = await this.prisma.groupMember.findMany({
			where,
			skip,
			take,
			include: { user: true },
			orderBy: { user: { firstName: 'asc' } }
		})

		return plainToInstance(
			UserResponseDto,
			members.map((m) => m.user)
		)
	}

	async getAvailableUsersForInvite(id: GroupId, ownerId: UserId): Promise<UserResponseDto[]> {
		// 1. Get all chatIds where ownerId has chats with other users (1-on-1 chats)
		const chats = await this.prisma.chat.findMany({
			where: { userId: ownerId },
			select: { chatId: true }
		})
		const chatIds = chats.map((c) => c.chatId)

		if (chatIds.length === 0) return []

		// 2. Get existing member userIds in this group
		const existingMembers = await this.prisma.groupMember.findMany({
			where: { groupId: id },
			select: { userId: true }
		})
		const existingMemberIds = new Set(existingMembers.map((m) => m.userId.toString()))

		// 3. Get users who:
		//    - Have a chat with the owner (chatId matches their userId)
		//    - Have privacySettings.invites === EVERYONE (everyone can invite)
		//    - Are not already in the group
		//    - Are not the owner themselves
		const availableUsers = await this.prisma.user.findMany({
			where: {
				id: { in: chatIds },
				NOT: { id: ownerId },
				privacySettings: {
					invites: PrivacyRule.EVERYBODY
				}
			},
			include: { privacySettings: true }
		})

		// 4. Filter out existing members in JS (simpler than complex NOT query)
		const filtered = availableUsers.filter((u) => !existingMemberIds.has(u.id.toString()))

		return plainToInstance(UserResponseDto, filtered)
	}

	async addMembers(id: GroupId, dto: AddMembersDto, ownerId: UserId): Promise<void> {
		const userIdBigInts = dto.userIds.map((uid) => BigInt(uid))

		// Check if users are banned
		const bannedUsers = await this.prisma.groupBlackList.findMany({
			where: {
				groupId: id,
				userId: { in: userIdBigInts }
			}
		})
		if (bannedUsers.length > 0) {
			throw new BadRequestException('Some users are banned from this group')
		}

		for (const userId of userIdBigInts) {
			const existing = await this.prisma.groupMember.findUnique({
				where: { groupId_userId: { groupId: id, userId } }
			})
			if (existing) continue

			await this.prisma.groupMember.create({
				data: { groupId: id, userId }
			})
			await this.chatsService.create(UserId(userId), ChatId(id))
		}

		this.realtimeGateway.sendToUser(ownerId, SocketEvent.CHAT_UPDATED, { chatId: id })
	}

	async delete(id: GroupId): Promise<void> {
		await this.prisma.group.delete({ where: { id } })
	}

	async isExists(id: GroupId): Promise<boolean> {
		return !!(await this.prisma.group.findFirst({ where: { id } }))
	}

	async isOwner(groupId: GroupId, userId: UserId): Promise<boolean> {
		return !!(await this.prisma.group.findFirst({
			where: { id: groupId, ownerId: userId }
		}))
	}

	async getBlackList(
		id: GroupId,
		skip: number,
		take: number,
		search?: string
	): Promise<UserResponseDto[]> {
		const where: Prisma.GroupBlackListWhereInput = {
			groupId: id,
			user: search
				? {
					OR: [
						{ firstName: { contains: search } },
						{ lastName: { contains: search } },
						{ username: { contains: search } }
					]
				}
				: undefined
		}

		const list = await this.prisma.groupBlackList.findMany({
			where,
			skip,
			take,
			include: { user: true },
			orderBy: { user: { firstName: 'asc' } }
		})

		return plainToInstance(
			UserResponseDto,
			list.map((m) => m.user)
		)
	}

	async unban(id: GroupId, targetUserId: UserId): Promise<void> {
		await this.prisma.groupBlackList
			.delete({
				where: { userId_groupId: { userId: targetUserId, groupId: id } }
			})
			.catch(() => { })
	}

	async getGroupInviteLinks(groupId: GroupId): Promise<InviteLinkResponseDto[]> {
		const links = await this.prisma.groupInviteLink.findMany({
			where: { groupId }
		})

		return plainToInstance(InviteLinkResponseDto, links)
	}

	async createGroupInviteLink(groupId: GroupId, creatorId: UserId, dto: CreateInviteLinkDto): Promise<InviteLinkResponseDto> {
		const code = randomBytes(16).toString('hex')
		const link = await this.prisma.groupInviteLink.create({
			data: {
				code,
				groupId,
				creatorId,
				maxUses: dto.maxUses,
				expiresAt: dto.expiresAt
			}
		})

		return plainToInstance(InviteLinkResponseDto, link)
	}

	async updateGroupInviteLink(groupId: GroupId, linkId: number, dto: UpdateInviteLinkDto): Promise<InviteLinkResponseDto> {
		const existing = await this.prisma.groupInviteLink.findUnique({ where: { id: linkId } })
		if (!existing || existing.groupId !== groupId) {
			throw new NotFoundException('Invite link not found')
		}

		const inviteLink = await this.prisma.groupInviteLink.update({
			where: { id: linkId },
			data: {
				maxUses: dto.maxUses !== undefined ? dto.maxUses : existing.maxUses,
				expiresAt:
					dto.expiresAt !== undefined
						? dto.expiresAt
							? BigInt(dto.expiresAt)
							: null
						: existing.expiresAt
			}
		})
		return plainToInstance(InviteLinkResponseDto, {
			...inviteLink,
			chatId: groupId
		})
	}

	async deleteGroupInviteLink(groupId: GroupId, linkId: number): Promise<void> {
		const existing = await this.prisma.groupInviteLink.findUnique({ where: { id: linkId } })
		if (!existing || existing.groupId !== groupId) {
			throw new NotFoundException('Invite link not found')
		}

		await this.prisma.groupInviteLink.delete({ where: { id: linkId } })
	}
}

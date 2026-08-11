import { plainToInstance } from 'class-transformer'
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { GroupResponseDto } from './dto/group-response.dto'
import { UpdateGroupDto } from './dto/update-group.dto'
import { ChatsService } from '../chats/chats.service'
import { ChatResponseDto } from '../chats/dto/chat-response.dto'
import { SearchService } from '../search/search.service'
import { StorageService } from '../storage/storage.service'
import { UserResponseDto } from '../users/dto/user-response.dto'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { GroupType, PrivacyRule } from '../../generated/prisma/enums'
import { GroupId } from '../../common/types/group-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { Prisma } from '../../generated/prisma/client'
import { SocketEvent } from '../../common/socket/socket-events'
import { AddMembersDto } from './dto/add-members.dto'
import { randomBytes } from 'crypto'
import { CreateInviteLinkDto } from '../../common/dtos/create-invite-link.dto'
import { UpdateInviteLinkDto } from '../../common/dtos/update-invite-link.dto'
import { InviteLinkResponseDto } from '../invites/dto/invite-link-response.dto'

@Injectable()
export class GroupsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly chatsService: ChatsService,
		private readonly searchService: SearchService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly storageService: StorageService
	) {}

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
				groupType: dto.groupType,
				noCopy: dto.noCopy
			}
		})

		if (dto.noCopy !== undefined && dto.noCopy !== existingGroup?.noCopy) {
			await this.notifyNoCopyChanged(id, group.noCopy)
		}

		return plainToInstance(GroupResponseDto, group)
	}

	async setNoCopy(id: GroupId, noCopy: boolean): Promise<GroupResponseDto> {
		const existingGroup = await this.prisma.group.findUnique({ where: { id } })
		if (!existingGroup) throw new NotFoundException('Group not found')

		if (existingGroup.noCopy === noCopy) {
			return plainToInstance(GroupResponseDto, existingGroup)
		}

		const group = await this.prisma.group.update({
			where: { id },
			data: { noCopy }
		})

		await this.notifyNoCopyChanged(id, group.noCopy)

		return plainToInstance(GroupResponseDto, group)
	}

	private async notifyNoCopyChanged(groupId: GroupId, noCopy: boolean): Promise<void> {
		const recipients = await this.getGroupAudience(groupId)

		for (const recipient of recipients) {
			this.realtimeGateway.sendToUser(recipient, SocketEvent.CHAT_UPDATED, {
				chatId: groupId,
				noCopy
			})
		}
	}

	private async getGroupAudience(groupId: GroupId): Promise<UserId[]> {
		const group = await this.prisma.group.findUnique({
			where: { id: groupId },
			select: { ownerId: true }
		})

		const members = await this.prisma.groupMember.findMany({
			where: { groupId },
			select: { userId: true }
		})

		const recipients = new Set<bigint>(members.map((m) => m.userId))
		if (group) recipients.add(group.ownerId)

		return Array.from(recipients).map((id) => UserId(id))
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
				.catch(() => {})

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
				.catch(() => {})

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

	async transferOwnership(
		groupId: GroupId,
		currentOwnerId: UserId,
		newOwnerId: UserId
	): Promise<void> {
		if (currentOwnerId === newOwnerId) {
			throw new BadRequestException('User is already the owner of the group')
		}

		const group = await this.prisma.group.findUnique({ where: { id: groupId } })
		if (!group) throw new NotFoundException('Group not found')

		const member = await this.prisma.groupMember.findUnique({
			where: { groupId_userId: { groupId, userId: newOwnerId } }
		})
		if (!member) {
			throw new BadRequestException('New owner must be a member of the group')
		}

		await this.prisma.$transaction(async (tx) => {
			await tx.group.update({
				where: { id: groupId },
				data: { ownerId: newOwnerId }
			})

			await tx.groupMember.deleteMany({
				where: { groupId, userId: newOwnerId }
			})

			await tx.groupMember.upsert({
				where: { groupId_userId: { groupId, userId: currentOwnerId } },
				create: { groupId, userId: currentOwnerId },
				update: {}
			})
		})

		this.realtimeGateway.sendToUser(currentOwnerId, SocketEvent.CHAT_UPDATED, {
			chatId: groupId
		})
		this.realtimeGateway.sendToUser(newOwnerId, SocketEvent.CHAT_UPDATED, { chatId: groupId })
	}

	async getById(id: GroupId, userId: UserId): Promise<GroupResponseDto> {
		const group = await this.prisma.group.findUnique({
			where: { id },
			include: {
				_count: { select: { members: true, blocked: true } },
				members: {
					where: { userId: userId },
					select: { userId: true }
				},
				photos: true
			}
		})

		if (!group) throw new NotFoundException('Group not found')

		const isMember = userId ? group.members.length > 0 : false
		const isOwner = userId ? group.ownerId === userId : false

		const response = plainToInstance(GroupResponseDto, {
			...group,
			membersCount: group._count.members,
			removedUsers: group._count.blocked,
			isMember,
			isOwner
		})
		response.avatars = group.photos.map((p) => ({ fileId: p.fileId }))
		return response
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
							{
								firstName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								lastName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								username: {
									contains: search,
									mode: 'insensitive'
								}
							}
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
		const chats = await this.prisma.chat.findMany({
			where: { userId: ownerId },
			select: { chatId: true }
		})
		const chatIds = chats.map((c) => c.chatId)

		if (chatIds.length === 0) return []

		const existingMembers = await this.prisma.groupMember.findMany({
			where: { groupId: id },
			select: { userId: true }
		})
		const existingMemberIds = new Set(existingMembers.map((m) => m.userId.toString()))

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

		const filtered = availableUsers.filter((u) => !existingMemberIds.has(u.id.toString()))

		return plainToInstance(UserResponseDto, filtered)
	}

	async addMembers(id: GroupId, dto: AddMembersDto, ownerId: UserId): Promise<void> {
		const userIdBigInts = dto.userIds.map((uid) => BigInt(uid))

		const bannedUsers = await this.prisma.groupBlackList.findMany({
			where: {
				groupId: id,
				userId: { in: userIdBigInts }
			}
		})
		if (bannedUsers.length > 0) {
			throw new BadRequestException('Some users are banned from this group')
		}

		const group = await this.prisma.group.findUnique({ where: { id } })
		if (!group) throw new NotFoundException('Group not found')

		const newMemberIds: UserId[] = []

		for (const userId of userIdBigInts) {
			const existing = await this.prisma.groupMember.findUnique({
				where: { groupId_userId: { groupId: id, userId } }
			})
			if (existing) continue

			await this.prisma.groupMember.create({
				data: { groupId: id, userId }
			})
			await this.chatsService.create(UserId(userId), ChatId(id))
			newMemberIds.push(UserId(userId))
		}

		const chatPayload = plainToInstance(ChatResponseDto, {
			id: group.id,
			name: group.name,
			isPinned: false,
			lastMessage: null
		})

		for (const memberId of newMemberIds) {
			this.realtimeGateway.sendToUser(memberId, SocketEvent.CHAT_NEW, chatPayload)
		}

		this.realtimeGateway.sendToUser(ownerId, SocketEvent.CHAT_UPDATED, { chatId: id })
	}

	async delete(id: GroupId): Promise<void> {
		const recipients = await this.getGroupAudience(id)

		await this.prisma.group.delete({ where: { id } })

		for (const recipient of recipients) {
			this.realtimeGateway.sendToUser(recipient, SocketEvent.CHAT_REMOVED, { chatId: id })
		}
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
							{
								firstName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								lastName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								username: {
									contains: search,
									mode: 'insensitive'
								}
							}
						]
					}
				: undefined
		}

		const list = await this.prisma.groupBlackList.findMany({
			where,
			skip,
			take,
			select: { user: true },
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
			.catch(() => {})
	}

	async getJoinRequests(
		id: GroupId,
		skip: number,
		take: number,
		search?: string
	): Promise<UserResponseDto[]> {
		const where: Prisma.GroupJoinRequestWhereInput = {
			groupId: id,
			user: search
				? {
						OR: [
							{
								firstName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								lastName: {
									contains: search,
									mode: 'insensitive'
								}
							},
							{
								username: {
									contains: search,
									mode: 'insensitive'
								}
							}
						]
					}
				: undefined
		}

		const requests = await this.prisma.groupJoinRequest.findMany({
			where,
			skip,
			take,
			include: { user: true },
			orderBy: { createdAt: 'desc' }
		})

		return plainToInstance(
			UserResponseDto,
			requests.map((r) => r.user)
		)
	}

	async acceptJoinRequest(id: GroupId, targetUserId: UserId): Promise<void> {
		const request = await this.prisma.groupJoinRequest.findUnique({
			where: { groupId_userId: { groupId: id, userId: targetUserId } }
		})

		if (!request) {
			throw new NotFoundException('Join request not found')
		}

		await this.prisma.$transaction(async (tx) => {
			await tx.groupJoinRequest.delete({
				where: { groupId_userId: { groupId: id, userId: targetUserId } }
			})

			const existingMember = await tx.groupMember.findUnique({
				where: { groupId_userId: { groupId: id, userId: targetUserId } }
			})

			if (!existingMember) {
				await tx.groupMember.create({
					data: { groupId: id, userId: targetUserId }
				})
			}
		})

		await this.chatsService.create(targetUserId, ChatId(id))

		const group = await this.prisma.group.findUnique({ where: { id } })
		if (group) {
			const chatPayload = plainToInstance(ChatResponseDto, {
				id: group.id,
				name: group.name,
				isPinned: false,
				lastMessage: null
			})

			this.realtimeGateway.sendToUser(targetUserId, SocketEvent.CHAT_NEW, chatPayload)
		}
	}

	async rejectJoinRequest(id: GroupId, targetUserId: UserId): Promise<void> {
		await this.prisma.groupJoinRequest
			.delete({
				where: { groupId_userId: { groupId: id, userId: targetUserId } }
			})
			.catch(() => {})
	}

	async getGroupInviteLinks(groupId: GroupId): Promise<InviteLinkResponseDto[]> {
		const links = await this.prisma.groupInviteLink.findMany({
			where: { groupId }
		})

		return plainToInstance(InviteLinkResponseDto, links)
	}

	async createGroupInviteLink(
		groupId: GroupId,
		creatorId: UserId,
		dto: CreateInviteLinkDto
	): Promise<InviteLinkResponseDto> {
		const code = randomBytes(16).toString('hex')
		const link = await this.prisma.groupInviteLink.create({
			data: {
				code,
				groupId,
				creatorId,
				maxUses: dto.maxUses,
				expiresAt: dto.expiresAt,
				requireApproval: dto.requireApproval ?? false
			}
		})

		return plainToInstance(InviteLinkResponseDto, link)
	}

	async updateGroupInviteLink(
		groupId: GroupId,
		linkId: number,
		dto: UpdateInviteLinkDto
	): Promise<InviteLinkResponseDto> {
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

	async confirmUploadAvatar(groupId: GroupId, fileId: string): Promise<void> {
		const file = await this.prisma.file.findFirst({
			where: { id: fileId }
		})

		if (file == null) {
			throw new NotFoundException('File not found')
		}

		await this.storageService.confirmUpload(fileId)

		await this.prisma.groupPhoto.create({
			data: {
				groupId: groupId,
				fileId: file.id,
				isCurrent: true
			}
		})
	}

	async deleteAvatar(groupId: GroupId, fileId: string): Promise<void> {
		const photo = await this.prisma.groupPhoto.findFirst({
			where: { groupId, fileId }
		})
		if (!photo) throw new NotFoundException('Avatar not found')

		await this.prisma.groupPhoto.delete({
			where: { fileId }
		})
		await this.storageService.deleteFile(fileId)
	}
}

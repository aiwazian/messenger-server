import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { GroupId } from '../../common/types/group-id.type'
import { UserId } from '../../common/types/user-id.type'
import { AdminPermission } from '../../common/decorators/admin-permission.decorator'
import {
	GroupAdminResponseDto,
	GroupMemberTagDto,
	MyGroupPermissionsDto,
	UpsertGroupAdminDto
} from './dto/group-admin.dto'

/**
 * Администраторы группы.
 *
 * Владелец в таблице прав не хранится: у него всегда все права, а строка
 * GroupAdminPermission существует только для назначенных администраторов.
 * Тег участника хранится здесь же и есть только в группах.
 */
@Injectable()
export class GroupAdminsService {
	constructor(private readonly prisma: PrismaService) {}

	async list(groupId: GroupId): Promise<GroupAdminResponseDto[]> {
		const admins = await this.prisma.groupAdminPermission.findMany({
			where: { groupId },
			include: {
				user: { select: { firstName: true, lastName: true, username: true } }
			},
			orderBy: { grantedAt: 'asc' }
		})

		return admins.map((admin) => ({
			userId: admin.userId.toString(),
			firstName: admin.user.firstName,
			lastName: admin.user.lastName ?? undefined,
			username: admin.user.username ?? undefined,
			canManageInviteLinks: admin.canManageInviteLinks,
			canEditProfile: admin.canEditProfile,
			tag: admin.tag ?? undefined,
			grantedAt: admin.grantedAt.toString()
		}))
	}

	/**
	 * Теги участников группы.
	 *
	 * Клиент подписывает ими имена отправителей в сообщениях, поэтому список
	 * доступен любому участнику группы, а не только владельцу.
	 */
	async getTags(groupId: GroupId): Promise<GroupMemberTagDto[]> {
		const admins = await this.prisma.groupAdminPermission.findMany({
			where: { groupId, NOT: { tag: null } },
			select: { userId: true, tag: true }
		})

		return admins
			.filter((admin) => !!admin.tag?.trim())
			.map((admin) => ({ userId: admin.userId.toString(), tag: admin.tag as string }))
	}

	/**
	 * Назначает администратора или переписывает его права и тег.
	 *
	 * Права выдаются только участнику группы: владельцу они не нужны.
	 */
	async upsert(
		groupId: GroupId,
		targetUserId: UserId,
		grantedBy: UserId,
		dto: UpsertGroupAdminDto
	): Promise<GroupAdminResponseDto> {
		const group = await this.prisma.group.findUnique({
			where: { id: groupId },
			select: { ownerId: true }
		})
		if (!group) throw new NotFoundException('Group not found')

		if (group.ownerId === targetUserId) {
			throw new BadRequestException('Owner already has all permissions')
		}

		const isMember = await this.prisma.groupMember.findUnique({
			where: { groupId_userId: { groupId, userId: targetUserId } }
		})
		if (!isMember) {
			throw new BadRequestException('User is not a member of the group')
		}

		const tag = dto.tag?.trim()

		const permissions = {
			canManageInviteLinks: dto.canManageInviteLinks ?? false,
			canEditProfile: dto.canEditProfile ?? false,
			tag: tag ? tag : null
		}

		const admin = await this.prisma.groupAdminPermission.upsert({
			where: { groupId_userId: { groupId, userId: targetUserId } },
			create: {
				groupId,
				userId: targetUserId,
				...permissions,
				grantedBy,
				grantedAt: BigInt(Date.now())
			},
			update: { ...permissions, grantedBy },
			include: {
				user: { select: { firstName: true, lastName: true, username: true } }
			}
		})

		return {
			userId: admin.userId.toString(),
			firstName: admin.user.firstName,
			lastName: admin.user.lastName ?? undefined,
			username: admin.user.username ?? undefined,
			canManageInviteLinks: admin.canManageInviteLinks,
			canEditProfile: admin.canEditProfile,
			tag: admin.tag ?? undefined,
			grantedAt: admin.grantedAt.toString()
		}
	}

	/** Снимает администратора: права и тег удаляются вместе со строкой. */
	async remove(groupId: GroupId, targetUserId: UserId): Promise<void> {
		await this.prisma.groupAdminPermission
			.delete({ where: { groupId_userId: { groupId, userId: targetUserId } } })
			.catch(() => {})
	}

	/** Права текущего пользователя: нужны клиенту, чтобы решить, что показывать. */
	async getMyPermissions(groupId: GroupId, userId: UserId): Promise<MyGroupPermissionsDto> {
		const group = await this.prisma.group.findUnique({
			where: { id: groupId },
			select: { ownerId: true }
		})
		if (!group) throw new NotFoundException('Group not found')

		if (group.ownerId === userId) {
			return {
				isOwner: true,
				isAdmin: true,
				canManageInviteLinks: true,
				canEditProfile: true
			}
		}

		const admin = await this.prisma.groupAdminPermission.findUnique({
			where: { groupId_userId: { groupId, userId } }
		})

		return {
			isOwner: false,
			isAdmin: admin != null,
			canManageInviteLinks: admin?.canManageInviteLinks ?? false,
			canEditProfile: admin?.canEditProfile ?? false,
			tag: admin?.tag ?? undefined
		}
	}

	/**
	 * Есть ли у пользователя право в группе.
	 *
	 * Без permission достаточно быть владельцем или администратором.
	 */
	async hasPermission(
		groupId: GroupId,
		userId: UserId,
		permission?: AdminPermission
	): Promise<boolean> {
		const group = await this.prisma.group.findUnique({
			where: { id: groupId },
			select: { ownerId: true }
		})
		if (!group) return false
		if (group.ownerId === userId) return true

		const admin = await this.prisma.groupAdminPermission.findUnique({
			where: { groupId_userId: { groupId, userId } }
		})
		if (!admin) return false
		if (!permission) return true

		return admin[permission] === true
	}
}

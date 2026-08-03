import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChannelId } from '../../common/types/channel-id.type'
import { UserId } from '../../common/types/user-id.type'
import { AdminPermission } from '../../common/decorators/admin-permission.decorator'
import {
	ChannelAdminResponseDto,
	MyChannelPermissionsDto,
	UpsertChannelAdminDto
} from './dto/channel-admin.dto'

/**
 * Администраторы канала.
 *
 * Владелец в таблице прав не хранится: у него всегда все права, а строка
 * ChannelAdminPermission существует только для назначенных администраторов.
 */
@Injectable()
export class ChannelAdminsService {
	constructor(private readonly prisma: PrismaService) {}

	async list(channelId: ChannelId): Promise<ChannelAdminResponseDto[]> {
		const admins = await this.prisma.channelAdminPermission.findMany({
			where: { channelId },
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
			grantedAt: admin.grantedAt.toString()
		}))
	}

	/**
	 * Назначает администратора или переписывает его права.
	 *
	 * Права выдаются только подписчику канала: владельцу они не нужны.
	 */
	async upsert(
		channelId: ChannelId,
		targetUserId: UserId,
		grantedBy: UserId,
		dto: UpsertChannelAdminDto
	): Promise<ChannelAdminResponseDto> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			select: { ownerId: true }
		})
		if (!channel) throw new NotFoundException('Channel not found')

		if (channel.ownerId === targetUserId) {
			throw new BadRequestException('Owner already has all permissions')
		}

		const isSubscriber = await this.prisma.channelSubscriber.findUnique({
			where: { userId_channelId: { userId: targetUserId, channelId } }
		})
		if (!isSubscriber) {
			throw new BadRequestException('User is not a subscriber of the channel')
		}

		const permissions = {
			canManageInviteLinks: dto.canManageInviteLinks ?? false,
			canEditProfile: dto.canEditProfile ?? false
		}

		const admin = await this.prisma.channelAdminPermission.upsert({
			where: { channelId_userId: { channelId, userId: targetUserId } },
			create: {
				channelId,
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
			grantedAt: admin.grantedAt.toString()
		}
	}

	/** Снимает администратора: строка прав удаляется целиком. */
	async remove(channelId: ChannelId, targetUserId: UserId): Promise<void> {
		await this.prisma.channelAdminPermission
			.delete({ where: { channelId_userId: { channelId, userId: targetUserId } } })
			.catch(() => {})
	}

	/** Права текущего пользователя: нужны клиенту, чтобы решить, что показывать. */
	async getMyPermissions(
		channelId: ChannelId,
		userId: UserId
	): Promise<MyChannelPermissionsDto> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			select: { ownerId: true }
		})
		if (!channel) throw new NotFoundException('Channel not found')

		if (channel.ownerId === userId) {
			return {
				isOwner: true,
				isAdmin: true,
				canManageInviteLinks: true,
				canEditProfile: true
			}
		}

		const admin = await this.prisma.channelAdminPermission.findUnique({
			where: { channelId_userId: { channelId, userId } }
		})

		return {
			isOwner: false,
			isAdmin: admin != null,
			canManageInviteLinks: admin?.canManageInviteLinks ?? false,
			canEditProfile: admin?.canEditProfile ?? false
		}
	}

	/**
	 * Есть ли у пользователя право в канале.
	 *
	 * Без permission достаточно быть владельцем или администратором.
	 */
	async hasPermission(
		channelId: ChannelId,
		userId: UserId,
		permission?: AdminPermission
	): Promise<boolean> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			select: { ownerId: true }
		})
		if (!channel) return false
		if (channel.ownerId === userId) return true

		const admin = await this.prisma.channelAdminPermission.findUnique({
			where: { channelId_userId: { channelId, userId } }
		})
		if (!admin) return false
		if (!permission) return true

		return admin[permission] === true
	}
}

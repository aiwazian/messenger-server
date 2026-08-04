import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChannelId } from '../../common/types/channel-id.type'
import { UserId } from '../../common/types/user-id.type'
import { AdminPermission } from '../../common/decorators/admin-permission.decorator'
import { UserResponseDto } from '../users/dto/user-response.dto'
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
			canManageAdmins: admin.canManageAdmins,
			grantedAt: admin.grantedAt.toString()
		}))
	}

	/**
	 * Подписчики, которых можно назначить администраторами.
	 *
	 * Владелец в список не попадает: у него и так все права.
	 */
	async listCandidates(channelId: ChannelId): Promise<UserResponseDto[]> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			select: { ownerId: true }
		})
		if (!channel) throw new NotFoundException('Channel not found')

		const subscribers = await this.prisma.channelSubscriber.findMany({
			where: { channelId, NOT: { userId: channel.ownerId } },
			include: { user: true },
			orderBy: { user: { firstName: 'asc' } }
		})

		return plainToInstance(
			UserResponseDto,
			subscribers.map((subscriber) => subscriber.user)
		)
	}

	/**
	 * Назначает администратора или переписывает его права.
	 *
	 * Права выдаются только подписчику канала: владельцу они не нужны.
	 * Администратор с правом canManageAdmins не может менять себя, трогать
	 * других управляющих администраторов и выдавать право на управление
	 * администраторами: это остаётся за владельцем.
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
			canEditProfile: dto.canEditProfile ?? false,
			canManageAdmins: dto.canManageAdmins ?? false
		}

		if (channel.ownerId !== grantedBy) {
			await this.assertCanManageTarget(channelId, grantedBy, targetUserId)

			if (permissions.canManageAdmins) {
				throw new ForbiddenException('Only the owner can grant admin management')
			}
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
			canManageAdmins: admin.canManageAdmins,
			grantedAt: admin.grantedAt.toString()
		}
	}

	/** Снимает администратора: строка прав удаляется целиком. */
	async remove(channelId: ChannelId, targetUserId: UserId, removedBy: UserId): Promise<void> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			select: { ownerId: true }
		})
		if (!channel) throw new NotFoundException('Channel not found')

		if (channel.ownerId !== removedBy) {
			await this.assertCanManageTarget(channelId, removedBy, targetUserId)
		}

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
				canEditProfile: true,
				canManageAdmins: true
			}
		}

		const admin = await this.prisma.channelAdminPermission.findUnique({
			where: { channelId_userId: { channelId, userId } }
		})

		return {
			isOwner: false,
			isAdmin: admin != null,
			canManageInviteLinks: admin?.canManageInviteLinks ?? false,
			canEditProfile: admin?.canEditProfile ?? false,
			canManageAdmins: admin?.canManageAdmins ?? false
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

	/**
	 * Проверяет, что администратор вправе менять выбранного пользователя.
	 *
	 * Себя администратор не трогает, чтобы не снять себе права, и не может
	 * менять другого администратора с правом на управление администраторами.
	 */
	private async assertCanManageTarget(
		channelId: ChannelId,
		actorId: UserId,
		targetUserId: UserId
	): Promise<void> {
		if (actorId === targetUserId) {
			throw new ForbiddenException('You cannot change your own permissions')
		}

		const target = await this.prisma.channelAdminPermission.findUnique({
			where: { channelId_userId: { channelId, userId: targetUserId } },
			select: { canManageAdmins: true }
		})

		if (target?.canManageAdmins) {
			throw new ForbiddenException('Only the owner can change this administrator')
		}
	}
}

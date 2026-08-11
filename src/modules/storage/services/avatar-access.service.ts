import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { StorageService } from '../storage.service'
import { FileDownloadDto } from '../../messages/dto/file-download.dto'
import { UserId } from '../../../common/types/user-id.type'
import { ChannelType, GroupType, PrivacyRule } from '../../../generated/prisma/enums'

/**
 * Доступ к файлам аватаров.
 *
 * Ссылка на скачивание выдавалась по одному только fileId, без проверки, чей
 * это файл: зная идентификатор, любой авторизованный пользователь получал
 * аватар закрытого канала, группы, в которой не состоит, или профиля, который
 * его заблокировал. Правила видимости живут здесь, а не в StorageService:
 * хранилище ничего не знает о профилях, подписках и приватности.
 */
@Injectable()
export class AvatarAccessService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly storage: StorageService
	) {}

	async getUserAvatarDownloadUrl(viewerId: UserId, fileId: string): Promise<FileDownloadDto> {
		const photo = await this.prisma.userPhoto.findUnique({
			where: { fileId },
			select: { userId: true }
		})
		if (!photo) throw new NotFoundException('Avatar not found')

		const ownerId = UserId(photo.userId)

		if (ownerId !== viewerId) {
			/*
			 * Блокировка режет доступ в обе стороны: заблокированный не видит
			 * фото того, кто его заблокировал, и наоборот — так же, как это
			 * уже сделано в выдаче профиля.
			 */
			const blocked = await this.prisma.userBlackList.findFirst({
				where: {
					OR: [
						{ blockerId: ownerId, blockedId: viewerId },
						{ blockerId: viewerId, blockedId: ownerId }
					]
				},
				select: { id: true }
			})
			if (blocked) throw new ForbiddenException('Avatar is not available')

			const privacy = await this.prisma.privacySettings.findUnique({
				where: { userId: ownerId },
				select: { profilePhoto: true }
			})
			if (privacy?.profilePhoto === PrivacyRule.NOBODY) {
				throw new ForbiddenException('Avatar is not available')
			}
		}

		return this.storage.getDownloadUrl(fileId)
	}

	async getChannelAvatarDownloadUrl(viewerId: UserId, fileId: string): Promise<FileDownloadDto> {
		const photo = await this.prisma.channelPhoto.findUnique({
			where: { fileId },
			select: { channelId: true }
		})
		if (!photo) throw new NotFoundException('Avatar not found')

		const channel = await this.prisma.channel.findUnique({
			where: { id: photo.channelId },
			select: { ownerId: true, channelType: true }
		})
		if (!channel) throw new NotFoundException('Avatar not found')

		/* Аватар публичного канала виден всем: канал и так открыт в поиске. */
		if (channel.channelType !== ChannelType.PUBLIC && channel.ownerId !== viewerId) {
			const subscription = await this.prisma.channelSubscriber.findUnique({
				where: { userId_channelId: { userId: viewerId, channelId: photo.channelId } },
				select: { id: true }
			})
			if (!subscription) throw new ForbiddenException('Avatar is not available')
		}

		return this.storage.getDownloadUrl(fileId)
	}

	async getGroupAvatarDownloadUrl(viewerId: UserId, fileId: string): Promise<FileDownloadDto> {
		const photo = await this.prisma.groupPhoto.findUnique({
			where: { fileId },
			select: { groupId: true }
		})
		if (!photo) throw new NotFoundException('Avatar not found')

		const group = await this.prisma.group.findUnique({
			where: { id: photo.groupId },
			select: { ownerId: true, groupType: true }
		})
		if (!group) throw new NotFoundException('Avatar not found')

		if (group.groupType !== GroupType.PUBLIC && group.ownerId !== viewerId) {
			const membership = await this.prisma.groupMember.findUnique({
				where: { groupId_userId: { groupId: photo.groupId, userId: viewerId } },
				select: { id: true }
			})
			if (!membership) throw new ForbiddenException('Avatar is not available')
		}

		return this.storage.getDownloadUrl(fileId)
	}
}

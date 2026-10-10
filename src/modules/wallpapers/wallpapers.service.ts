import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { Wallpaper } from '../../generated/prisma/client'
import { FileStatus } from '../../generated/prisma/enums'
import { FileType } from '../../common/enums/file-type.enum'
import { ChatType } from '../../common/enums/chat-type.enum'
import { detectChatType } from '../../common/utils/detect-chat-type.util'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChannelId } from '../../common/types/channel-id.type'
import { GroupId } from '../../common/types/group-id.type'
import { SetWallpaperDto } from './dto/set-wallpaper.dto'
import { SetChatWallpaperDto } from './dto/set-chat-wallpaper.dto'
import { WallpaperResponseDto, WallpaperSource } from './dto/wallpaper-response.dto'

type WallpaperOwnerRow = { id: number; wallpaperId: number | null }

@Injectable()
export class WallpapersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly storage: StorageService
	) {}

	async getMy(userId: UserId): Promise<WallpaperResponseDto | null> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { wallpaper: true }
		})

		if (!user?.wallpaper) {
			return null
		}

		return this.toDto(user.wallpaper, WallpaperSource.USER)
	}

	async setMy(userId: UserId, dto: SetWallpaperDto): Promise<WallpaperResponseDto> {
		const previous = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { wallpaperId: true }
		})

		const wallpaper = await this.createWallpaper(dto)

		await this.prisma.user.update({
			where: { id: userId },
			data: { wallpaperId: wallpaper.id }
		})

		await this.deleteUnreferenced(previous?.wallpaperId)

		return this.toDto(wallpaper, WallpaperSource.USER)
	}

	async resetMy(userId: UserId): Promise<void> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { wallpaperId: true }
		})

		await this.prisma.user.update({
			where: { id: userId },
			data: { wallpaperId: null }
		})

		await this.deleteUnreferenced(user?.wallpaperId)
	}

	async getChatWallpaper(userId: UserId, chatId: ChatId): Promise<WallpaperResponseDto | null> {
		const chat = await this.prisma.chat.findUnique({
			where: { chat_uniq_id: `${userId}${chatId}` },
			select: { wallpaper: true }
		})

		if (chat?.wallpaper) {
			return this.toDto(chat.wallpaper, WallpaperSource.CHAT)
		}

		const chatType = detectChatType(chatId)

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: chatId },
				select: { wallpaper: true }
			})

			if (channel?.wallpaper) {
				return this.toDto(channel.wallpaper, WallpaperSource.CHANNEL)
			}
		}

		if (chatType === ChatType.GROUP) {
			const group = await this.prisma.group.findUnique({
				where: { id: chatId },
				select: { wallpaper: true }
			})

			if (group?.wallpaper) {
				return this.toDto(group.wallpaper, WallpaperSource.GROUP)
			}
		}

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { wallpaper: true }
		})

		if (!user?.wallpaper) {
			return null
		}

		return this.toDto(user.wallpaper, WallpaperSource.USER)
	}

	async setChatWallpaper(
		userId: UserId,
		chatId: ChatId,
		dto: SetChatWallpaperDto
	): Promise<WallpaperResponseDto> {
		if (detectChatType(chatId) !== ChatType.PRIVATE) {
			throw new BadRequestException('Wallpaper can be changed only in private chats')
		}

		if (dto.scope === 'all') {
			const peer = await this.prisma.user.findUnique({
				where: { id: chatId },
				select: { id: true }
			})

			if (!peer) {
				throw new NotFoundException('User not found')
			}
		}

		const uniqIds = [`${userId}${chatId}`, `${chatId}${userId}`]
		const previous = await this.prisma.chat.findMany({
			where: { chat_uniq_id: { in: uniqIds } },
			select: { id: true, wallpaperId: true }
		})

		const wallpaper = await this.createWallpaper(dto)

		await this.prisma.chat.upsert({
			where: { chat_uniq_id: `${userId}${chatId}` },
			update: { wallpaperId: wallpaper.id },
			create: {
				chat_uniq_id: `${userId}${chatId}`,
				userId,
				chatId,
				wallpaperId: wallpaper.id
			}
		})

		if (dto.scope === 'all') {
			await this.prisma.chat.upsert({
				where: { chat_uniq_id: `${chatId}${userId}` },
				update: { wallpaperId: wallpaper.id },
				create: {
					chat_uniq_id: `${chatId}${userId}`,
					userId: chatId,
					chatId: userId,
					wallpaperId: wallpaper.id
				}
			})
		}

		await this.cleanup(previous, wallpaper.id)

		return this.toDto(wallpaper, WallpaperSource.CHAT)
	}

	async resetChatWallpaper(userId: UserId, chatId: ChatId, scope: 'me' | 'all'): Promise<void> {
		if (detectChatType(chatId) !== ChatType.PRIVATE) {
			throw new BadRequestException('Wallpaper can be changed only in private chats')
		}

		const uniqIds = scope === 'all' ? [`${userId}${chatId}`, `${chatId}${userId}`] : [`${userId}${chatId}`]

		const previous = await this.prisma.chat.findMany({
			where: { chat_uniq_id: { in: uniqIds }, wallpaperId: { not: null } },
			select: { id: true, wallpaperId: true }
		})

		await this.prisma.chat.updateMany({
			where: { chat_uniq_id: { in: uniqIds } },
			data: { wallpaperId: null }
		})

		await this.cleanup(previous)
	}

	async setChannelWallpaper(
		channelId: ChannelId,
		dto: SetWallpaperDto
	): Promise<WallpaperResponseDto> {
		const previous = await this.prisma.channel.findUnique({
			where: { id: channelId },
			select: { wallpaperId: true }
		})

		const wallpaper = await this.createWallpaper(dto)

		await this.prisma.channel.update({
			where: { id: channelId },
			data: { wallpaperId: wallpaper.id }
		})

		await this.deleteUnreferenced(previous?.wallpaperId)

		return this.toDto(wallpaper, WallpaperSource.CHANNEL)
	}

	async resetChannelWallpaper(channelId: ChannelId): Promise<void> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			select: { wallpaperId: true }
		})

		await this.prisma.channel.update({
			where: { id: channelId },
			data: { wallpaperId: null }
		})

		await this.deleteUnreferenced(channel?.wallpaperId)
	}

	async setGroupWallpaper(groupId: GroupId, dto: SetWallpaperDto): Promise<WallpaperResponseDto> {
		const previous = await this.prisma.group.findUnique({
			where: { id: groupId },
			select: { wallpaperId: true }
		})

		const wallpaper = await this.createWallpaper(dto)

		await this.prisma.group.update({
			where: { id: groupId },
			data: { wallpaperId: wallpaper.id }
		})

		await this.deleteUnreferenced(previous?.wallpaperId)

		return this.toDto(wallpaper, WallpaperSource.GROUP)
	}

	async resetGroupWallpaper(groupId: GroupId): Promise<void> {
		const group = await this.prisma.group.findUnique({
			where: { id: groupId },
			select: { wallpaperId: true }
		})

		await this.prisma.group.update({
			where: { id: groupId },
			data: { wallpaperId: null }
		})

		await this.deleteUnreferenced(group?.wallpaperId)
	}

	private async createWallpaper(dto: SetWallpaperDto): Promise<Wallpaper> {
		const file = await this.prisma.file.findUnique({ where: { id: dto.fileId } })

		if (!file) {
			throw new NotFoundException('File not found')
		}

		if (file.status !== FileStatus.UPLOADED) {
			throw new ConflictException('File was not uploaded')
		}

		if (!file.path.startsWith(`${FileType.WALLPAPER}/`)) {
			throw new ForbiddenException('File is not a wallpaper')
		}

		return this.prisma.wallpaper.create({
			data: {
				fileId: dto.fileId,
				darken: dto.darken,
				blur: dto.blur,
				offsetX: dto.offsetX,
				offsetY: dto.offsetY
			}
		})
	}

	private async cleanup(rows: WallpaperOwnerRow[], keepId?: number): Promise<void> {
		const ids = [
			...new Set(
				rows
					.map((row) => row.wallpaperId)
					.filter((id): id is number => id !== null && id !== keepId)
			)
		]

		await Promise.all(ids.map((id) => this.deleteUnreferenced(id)))
	}

	private async deleteUnreferenced(id: number | null | undefined): Promise<void> {
		if (id == null) {
			return
		}

		const [chats, users, channels, groups] = await Promise.all([
			this.prisma.chat.count({ where: { wallpaperId: id } }),
			this.prisma.user.count({ where: { wallpaperId: id } }),
			this.prisma.channel.count({ where: { wallpaperId: id } }),
			this.prisma.group.count({ where: { wallpaperId: id } })
		])

		if (chats + users + channels + groups > 0) {
			return
		}

		const wallpaper = await this.prisma.wallpaper.findUnique({ where: { id } })

		if (!wallpaper) {
			return
		}

		await this.prisma.wallpaper.delete({ where: { id } })
		await this.storage.releaseFile(wallpaper.fileId)
	}

	private async toDto(wallpaper: Wallpaper, source: WallpaperSource): Promise<WallpaperResponseDto> {
		const download = await this.storage.getDownloadUrl(wallpaper.fileId)

		return plainToInstance(WallpaperResponseDto, {
			id: wallpaper.id,
			fileId: wallpaper.fileId,
			url: download.downloadUrl,
			name: download.name,
			mimeType: download.mimeType,
			darken: wallpaper.darken,
			blur: wallpaper.blur,
			offsetX: wallpaper.offsetX,
			offsetY: wallpaper.offsetY,
			source
		})
	}
}

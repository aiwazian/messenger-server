import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { FileType } from '../../common/enums/file-type.enum'
import { UploadCategory } from '../../common/enums/upload-category.enum'
import { StickerPackId } from '../../common/types/sticker-pack-id.type'
import { UserId } from '../../common/types/user-id.type'
import { generateStickerPackId } from '../../common/utils/id-generator.util'
import { FileStatus } from '../../generated/prisma/enums'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { FileInitDto } from '../messages/dto/file-init.dto'
import { STICKER_MIME_TYPE } from '../storage/constants/upload.constants'
import { FileDto } from '../storage/dto/file.dto'
import { InitUploadDto } from '../storage/dto/init-upload.dto'
import { StorageService } from '../storage/storage.service'
import { CreateStickerPackDto } from './dto/create-sticker-pack.dto'
import { StickerPackResponseDto } from './dto/sticker-pack-response.dto'
import { StickerPackUsernameAvailabilityDto } from './dto/sticker-pack-username-availability.dto'
import {
	MAX_STICKER_PACK_USERNAME_LENGTH,
	MIN_STICKER_PACK_USERNAME_LENGTH,
	STICKER_PACK_USERNAME_PATTERN
} from './dto/sticker-pack.constants'
import { UpdateStickerPackDto } from './dto/update-sticker-pack.dto'

type PackRow = {
	id: bigint
	name: string
	username: string
	ownerId: bigint
}

type StickerRow = {
	id: bigint
	fileId: string
	emojis: string[]
	sortOrder: number
	file: { path: string }
}

type PackView = {
	stickerCount: number
	isOwned: boolean
	isInstalled: boolean
	stickers: StickerRow[]
}

@Injectable()
export class StickersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly storage: StorageService
	) {}

	async getCreatedPacks(userId: UserId): Promise<StickerPackResponseDto[]> {
		const packs = await this.prisma.stickerPack.findMany({
			where: { ownerId: userId },
			orderBy: { createdAt: 'desc' },
			include: {
				_count: { select: { stickers: true } },
				installs: { where: { userId }, select: { id: true } }
			}
		})

		return packs.map(pack =>
			this.toPackDto(pack, {
				stickerCount: pack._count.stickers,
				isOwned: true,
				isInstalled: pack.installs.length > 0,
				stickers: []
			})
		)
	}

	async getAddedPacks(userId: UserId): Promise<StickerPackResponseDto[]> {
		const installs = await this.prisma.userStickerPack.findMany({
			where: { userId },
			orderBy: { sortOrder: 'asc' },
			include: {
				pack: { include: { _count: { select: { stickers: true } } } }
			}
		})

		return installs.map(install =>
			this.toPackDto(install.pack, {
				stickerCount: install.pack._count.stickers,
				isOwned: install.pack.ownerId === userId,
				isInstalled: true,
				stickers: []
			})
		)
	}

	getPack(userId: UserId, packId: StickerPackId): Promise<StickerPackResponseDto> {
		return this.findPackDetail(userId, { id: packId })
	}

	getPackByUsername(userId: UserId, username: string): Promise<StickerPackResponseDto> {
		return this.findPackDetail(userId, { username: this.normalizeUsername(username) })
	}

	async checkUsername(
		username: string,
		packId?: StickerPackId
	): Promise<StickerPackUsernameAvailabilityDto> {
		const normalized = this.normalizeUsername(username)

		if (!this.isUsernameWellFormed(normalized)) {
			return plainToInstance(StickerPackUsernameAvailabilityDto, { available: false })
		}

		const existing = await this.prisma.stickerPack.findUnique({
			where: { username: normalized },
			select: { id: true }
		})

		const available = !existing || existing.id === packId

		return plainToInstance(StickerPackUsernameAvailabilityDto, { available })
	}

	async createPack(userId: UserId, dto: CreateStickerPackDto): Promise<StickerPackResponseDto> {
		const fileIds = dto.stickers.map(sticker => sticker.fileId)

		await this.assertStickerFilesUsable(fileIds)
		await this.assertUsernameFree(dto.username)

		const now = BigInt(Date.now())
		const packId = generateStickerPackId()

		try {
			await this.prisma.stickerPack.create({
				data: {
					id: packId,
					name: dto.name,
					username: dto.username,
					ownerId: userId,
					createdAt: now,
					stickers: {
						create: dto.stickers.map((sticker, index) => ({
							fileId: sticker.fileId,
							emojis: sticker.emojis,
							sortOrder: index,
							createdAt: now
						}))
					}
				}
			})
		} catch (error) {
			throw this.mapUsernameConflict(error)
		}

		return this.getPack(userId, packId)
	}

	async updatePack(
		userId: UserId,
		packId: StickerPackId,
		dto: UpdateStickerPackDto
	): Promise<StickerPackResponseDto> {
		const pack = await this.prisma.stickerPack.findUnique({
			where: { id: packId },
			include: { stickers: { select: { id: true, fileId: true } } }
		})

		if (!pack) {
			throw new NotFoundException('Sticker pack not found')
		}

		if (pack.ownerId !== userId) {
			throw new ForbiddenException('Only the owner can edit a sticker pack')
		}

		if (dto.username !== undefined && dto.username !== pack.username) {
			await this.assertUsernameFree(dto.username)
		}

		const desiredStickers = dto.stickers
		const desiredFileIds = desiredStickers?.map(sticker => sticker.fileId)

		if (desiredFileIds) {
			await this.assertStickerFilesUsable(desiredFileIds)
		}

		const removedFileIds = desiredFileIds
			? pack.stickers
					.filter(sticker => !desiredFileIds.includes(sticker.fileId))
					.map(sticker => sticker.fileId)
			: []

		try {
			await this.prisma.$transaction(async tx => {
				await tx.stickerPack.update({
					where: { id: packId },
					data: { name: dto.name, username: dto.username }
				})

				if (!desiredStickers || !desiredFileIds) {
					return
				}

				await tx.sticker.deleteMany({
					where: { packId, fileId: { notIn: desiredFileIds } }
				})

				const now = BigInt(Date.now())
				const existingByFileId = new Map(
					pack.stickers.map(sticker => [sticker.fileId, sticker.id])
				)

				for (const [index, sticker] of desiredStickers.entries()) {
					const existingId = existingByFileId.get(sticker.fileId)

					if (existingId !== undefined) {
						await tx.sticker.update({
							where: { id: existingId },
							data: { sortOrder: index, emojis: sticker.emojis }
						})

						continue
					}

					await tx.sticker.create({
						data: {
							packId,
							fileId: sticker.fileId,
							emojis: sticker.emojis,
							sortOrder: index,
							createdAt: now
						}
					})
				}
			})
		} catch (error) {
			throw this.mapUsernameConflict(error)
		}

		for (const fileId of removedFileIds) {
			await this.storage.releaseFile(fileId)
		}

		return this.getPack(userId, packId)
	}

	async deletePack(userId: UserId, packId: StickerPackId): Promise<void> {
		const pack = await this.prisma.stickerPack.findUnique({
			where: { id: packId },
			include: { stickers: { select: { fileId: true } } }
		})

		if (!pack) {
			throw new NotFoundException('Sticker pack not found')
		}

		if (pack.ownerId !== userId) {
			throw new ForbiddenException('Only the owner can delete a sticker pack')
		}

		await this.prisma.stickerPack.delete({ where: { id: packId } })

		for (const sticker of pack.stickers) {
			await this.storage.releaseFile(sticker.fileId)
		}
	}

	async installPack(userId: UserId, packId: StickerPackId): Promise<void> {
		const pack = await this.prisma.stickerPack.findUnique({
			where: { id: packId },
			select: { id: true }
		})

		if (!pack) {
			throw new NotFoundException('Sticker pack not found')
		}

		const last = await this.prisma.userStickerPack.findFirst({
			where: { userId },
			orderBy: { sortOrder: 'desc' },
			select: { sortOrder: true }
		})

		await this.prisma.userStickerPack.upsert({
			where: { userId_packId: { userId, packId } },
			create: {
				userId,
				packId,
				sortOrder: (last?.sortOrder ?? -1) + 1,
				addedAt: BigInt(Date.now())
			},
			update: {}
		})
	}

	async uninstallPack(userId: UserId, packId: StickerPackId): Promise<void> {
		await this.prisma.userStickerPack.deleteMany({ where: { userId, packId } })
	}

	initStickerUpload(dto: FileInitDto): Promise<InitUploadDto> {
		return this.storage.initUpload({
			name: dto.name,
			size: dto.size,
			mimeType: dto.mimeType,
			category: UploadCategory.STICKER,
			directory: FileType.STICKER,
			width: dto.width,
			height: dto.height
		})
	}

	confirmStickerUpload(fileId: string): Promise<FileDto> {
		return this.storage.confirmUpload(fileId)
	}

	private async findPackDetail(
		userId: UserId,
		where: { id: bigint } | { username: string }
	): Promise<StickerPackResponseDto> {
		const pack = await this.prisma.stickerPack.findUnique({
			where,
			include: {
				stickers: {
					orderBy: { sortOrder: 'asc' },
					select: {
						id: true,
						fileId: true,
						emojis: true,
						sortOrder: true,
						file: { select: { path: true } }
					}
				},
				installs: { where: { userId }, select: { id: true } }
			}
		})

		if (!pack) {
			throw new NotFoundException('Sticker pack not found')
		}

		return this.toPackDto(pack, {
			stickerCount: pack.stickers.length,
			isOwned: pack.ownerId === userId,
			isInstalled: pack.installs.length > 0,
			stickers: pack.stickers
		})
	}

	private async assertStickerFilesUsable(fileIds: string[]): Promise<void> {
		const uniqueIds = new Set(fileIds)

		if (uniqueIds.size !== fileIds.length) {
			throw new ConflictException('Sticker pack contains the same sticker twice')
		}

		const files = await this.prisma.file.findMany({
			where: { id: { in: [...uniqueIds] } },
			select: { id: true, path: true, status: true, mimeType: true }
		})

		if (files.length !== uniqueIds.size) {
			throw new NotFoundException('Sticker file not found')
		}

		for (const file of files) {
			if (file.status !== FileStatus.UPLOADED) {
				throw new ConflictException('Sticker upload not completed')
			}

			if (!file.path.startsWith(`${FileType.STICKER}/`)) {
				throw new ConflictException('File is not a sticker')
			}

			if (file.mimeType !== STICKER_MIME_TYPE) {
				throw new ConflictException('Sticker must be a WebP image')
			}
		}
	}

	private async assertUsernameFree(username: string): Promise<void> {
		const existing = await this.prisma.stickerPack.findUnique({
			where: { username },
			select: { id: true }
		})

		if (existing) {
			throw new ConflictException('Sticker pack username is already taken')
		}
	}

	private normalizeUsername(username: string): string {
		return username.trim().toLowerCase()
	}

	private isUsernameWellFormed(username: string): boolean {
		return (
			username.length >= MIN_STICKER_PACK_USERNAME_LENGTH &&
			username.length <= MAX_STICKER_PACK_USERNAME_LENGTH &&
			STICKER_PACK_USERNAME_PATTERN.test(username)
		)
	}

	private mapUsernameConflict(error: unknown): unknown {
		const code = (error as { code?: string } | null)?.code

		if (code === 'P2002') {
			return new ConflictException('Sticker pack username is already taken')
		}

		return error
	}

	private toPackDto(pack: PackRow, view: PackView): StickerPackResponseDto {
		return plainToInstance(StickerPackResponseDto, {
			id: pack.id.toString(),
			name: pack.name,
			username: pack.username,
			ownerId: pack.ownerId.toString(),
			stickerCount: view.stickerCount,
			isOwned: view.isOwned,
			isInstalled: view.isInstalled,
			stickers: view.stickers.map(sticker => ({
				id: sticker.id.toString(),
				fileId: sticker.fileId,
				url: this.storage.getPublicUrl(sticker.file.path),
				emojis: sticker.emojis,
				sortOrder: sticker.sortOrder
			}))
		})
	}
}

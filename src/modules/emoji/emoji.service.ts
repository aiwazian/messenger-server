import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { FileType } from '../../common/enums/file-type.enum'
import { UploadCategory } from '../../common/enums/upload-category.enum'
import { EmojiPackId } from '../../common/types/emoji-pack-id.type'
import { UserId } from '../../common/types/user-id.type'
import { generateEmojiPackId } from '../../common/utils/id-generator.util'
import { FileStatus } from '../../generated/prisma/enums'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { EMOJI_MIME_TYPE } from '../storage/constants/upload.constants'
import { FileDto } from '../storage/dto/file.dto'
import { InitUploadDto } from '../storage/dto/init-upload.dto'
import { StorageService } from '../storage/storage.service'
import { CreateEmojiPackDto } from './dto/create-emoji-pack.dto'
import { EmojiItemResponseDto } from './dto/emoji-item-response.dto'
import { EmojiPackIdDto } from './dto/emoji-pack-id.dto'
import { EmojiPackResponseDto } from './dto/emoji-pack-response.dto'
import { EmojiPackUsernameAvailabilityDto } from './dto/emoji-pack-username-availability.dto'
import {
	EMOJI_PACK_USERNAME_PATTERN,
	MAX_EMOJI_PACK_USERNAME_LENGTH,
	MIN_EMOJI_PACK_USERNAME_LENGTH
} from './dto/emoji-pack.constants'
import { EmojiUploadInitDto } from './dto/emoji-upload-init.dto'
import { UpdateEmojiPackDto } from './dto/update-emoji-pack.dto'

type PackRow = {
	id: bigint
	name: string
	username: string
	ownerId: bigint
	coverFileId: string | null
	cover?: { path: string } | null
}

type EmojiRow = {
	id: bigint
	fileId: string
	emojis: string[]
	sortOrder: number
	file: { path: string }
}

type PackView = {
	emojiCount: number
	isOwned: boolean
	isInstalled: boolean
	emojis: EmojiRow[]
	coverFallbackPath?: string | null
}

@Injectable()
export class EmojiService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly storage: StorageService
	) {}

	async getCreatedPacks(userId: UserId): Promise<EmojiPackResponseDto[]> {
		const packs = await this.prisma.emojiPack.findMany({
			where: { ownerId: userId, deletedAt: null },
			orderBy: { createdAt: 'desc' },
			include: {
				_count: { select: { emojis: true } },
				cover: { select: { path: true } },
				emojis: {
					take: 1,
					orderBy: { sortOrder: 'asc' },
					select: { file: { select: { path: true } } }
				},
				installs: { where: { userId }, select: { id: true } }
			}
		})

		return packs.map(pack =>
			this.toPackDto(pack, {
				emojiCount: pack._count.emojis,
				isOwned: true,
				isInstalled: pack.installs.length > 0,
				emojis: [],
				coverFallbackPath: pack.emojis[0]?.file.path
			})
		)
	}

	async getAddedPacks(userId: UserId, includeEmojis = false): Promise<EmojiPackResponseDto[]> {
		if (includeEmojis) {
			const detailed = await this.prisma.userEmojiPack.findMany({
				where: { userId, pack: { deletedAt: null } },
				orderBy: { sortOrder: 'asc' },
				include: {
					pack: {
						include: {
							cover: { select: { path: true } },
							emojis: {
								orderBy: { sortOrder: 'asc' },
								select: {
									id: true,
									fileId: true,
									emojis: true,
									sortOrder: true,
									file: { select: { path: true } }
								}
							}
						}
					}
				}
			})

			return detailed.map(install =>
				this.toPackDto(install.pack, {
					emojiCount: install.pack.emojis.length,
					isOwned: install.pack.ownerId === userId,
					isInstalled: true,
					emojis: install.pack.emojis
				})
			)
		}

		const installs = await this.prisma.userEmojiPack.findMany({
			where: { userId, pack: { deletedAt: null } },
			orderBy: { sortOrder: 'asc' },
			include: {
				pack: {
					include: {
						_count: { select: { emojis: true } },
						cover: { select: { path: true } },
						emojis: {
							take: 1,
							orderBy: { sortOrder: 'asc' },
							select: { file: { select: { path: true } } }
						}
					}
				}
			}
		})

		return installs.map(install =>
			this.toPackDto(install.pack, {
				emojiCount: install.pack._count.emojis,
				isOwned: install.pack.ownerId === userId,
				isInstalled: true,
				emojis: [],
				coverFallbackPath: install.pack.emojis[0]?.file.path
			})
		)
	}

	async getEmojiItems(ids: bigint[]): Promise<EmojiItemResponseDto[]> {
		if (ids.length === 0) {
			return []
		}

		const emojis = await this.prisma.emoji.findMany({
			where: { id: { in: ids } },
			orderBy: { sortOrder: 'asc' },
			select: {
				id: true,
				packId: true,
				fileId: true,
				emojis: true,
				sortOrder: true,
				file: { select: { path: true } }
			}
		})

		return emojis.map(emoji =>
			plainToInstance(EmojiItemResponseDto, {
				id: emoji.id.toString(),
				packId: emoji.packId.toString(),
				fileId: emoji.fileId,
				url: this.storage.getPublicUrl(emoji.file.path),
				emojis: emoji.emojis,
				sortOrder: emoji.sortOrder
			})
		)
	}

	getPack(userId: UserId, packId: EmojiPackId): Promise<EmojiPackResponseDto> {
		return this.findPackDetail(userId, { id: packId }, true)
	}

	getPackByUsername(userId: UserId, username: string): Promise<EmojiPackResponseDto> {
		return this.findPackDetail(userId, { username: this.normalizeUsername(username) })
	}

	reservePackId(): EmojiPackIdDto {
		return plainToInstance(EmojiPackIdDto, {
			packId: generateEmojiPackId().toString()
		})
	}

	async checkUsername(
		username: string,
		packId?: EmojiPackId
	): Promise<EmojiPackUsernameAvailabilityDto> {
		const normalized = this.normalizeUsername(username)

		if (!this.isUsernameWellFormed(normalized)) {
			return plainToInstance(EmojiPackUsernameAvailabilityDto, { available: false })
		}

		const existing = await this.prisma.emojiPack.findUnique({
			where: { username: normalized },
			select: { id: true }
		})

		const available = !existing || existing.id === packId

		return plainToInstance(EmojiPackUsernameAvailabilityDto, { available })
	}

	async createPack(userId: UserId, dto: CreateEmojiPackDto): Promise<EmojiPackResponseDto> {
		const fileIds = dto.emojis.map(emoji => emoji.fileId)

		await this.assertEmojiFilesUsable(fileIds)

		if (dto.coverFileId) {
			await this.assertEmojiFileUsable(dto.coverFileId)
		}

		await this.assertUsernameFree(dto.username)

		const now = BigInt(Date.now())
		const packId = dto.id === undefined ? generateEmojiPackId() : EmojiPackId(dto.id)

		await this.assertPackIdFree(packId)

		try {
			await this.prisma.emojiPack.create({
				data: {
					id: packId,
					name: dto.name,
					username: dto.username,
					ownerId: userId,
					createdAt: now,
					coverFileId: dto.coverFileId ?? null,
					emojis: {
						create: dto.emojis.map((emoji, index) => ({
							fileId: emoji.fileId,
							emojis: emoji.emojis,
							sortOrder: index,
							createdAt: now
						}))
					}
				}
			})
		} catch (error) {
			throw this.mapUsernameConflict(error)
		}

		await this.installPack(userId, packId)

		return this.getPack(userId, packId)
	}

	async updatePack(
		userId: UserId,
		packId: EmojiPackId,
		dto: UpdateEmojiPackDto
	): Promise<EmojiPackResponseDto> {
		const pack = await this.prisma.emojiPack.findUnique({
			where: { id: packId },
			include: { emojis: { select: { id: true, fileId: true } } }
		})

		if (!pack || pack.deletedAt !== null) {
			throw new NotFoundException('Emoji pack not found')
		}

		if (pack.ownerId !== userId) {
			throw new ForbiddenException('Only the owner can edit an emoji pack')
		}

		if (dto.username !== undefined && dto.username !== pack.username) {
			await this.assertUsernameFree(dto.username)
		}

		if (dto.coverFileId) {
			await this.assertEmojiFileUsable(dto.coverFileId)
		}

		const previousCoverFileId = pack.coverFileId
		const nextCoverFileId = dto.removeCover === true ? null : dto.coverFileId
		const desiredEmojis = dto.emojis
		const desiredFileIds = desiredEmojis?.map(emoji => emoji.fileId)

		if (desiredFileIds) {
			await this.assertEmojiFilesUsable(desiredFileIds)
		}

		const removedFileIds = desiredFileIds
			? pack.emojis
					.filter(emoji => !desiredFileIds.includes(emoji.fileId))
					.map(emoji => emoji.fileId)
			: []

		try {
			await this.prisma.$transaction(async tx => {
				await tx.emojiPack.update({
					where: { id: packId },
					data: {
						name: dto.name,
						username: dto.username,
						coverFileId: nextCoverFileId
					}
				})

				if (!desiredEmojis || !desiredFileIds) {
					return
				}

				await tx.emoji.deleteMany({
					where: { packId, fileId: { notIn: desiredFileIds } }
				})

				const now = BigInt(Date.now())
				const existingByFileId = new Map(pack.emojis.map(emoji => [emoji.fileId, emoji.id]))

				for (const [index, emoji] of desiredEmojis.entries()) {
					const existingId = existingByFileId.get(emoji.fileId)

					if (existingId !== undefined) {
						await tx.emoji.update({
							where: { id: existingId },
							data: { sortOrder: index, emojis: emoji.emojis }
						})

						continue
					}

					await tx.emoji.create({
						data: {
							packId,
							fileId: emoji.fileId,
							emojis: emoji.emojis,
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

		if (
			nextCoverFileId !== undefined &&
			previousCoverFileId &&
			previousCoverFileId !== nextCoverFileId
		) {
			await this.storage.releaseFile(previousCoverFileId)
		}

		return this.getPack(userId, packId)
	}

	async deletePack(userId: UserId, packId: EmojiPackId): Promise<void> {
		const pack = await this.prisma.emojiPack.findUnique({
			where: { id: packId },
			select: { ownerId: true, deletedAt: true }
		})

		if (!pack || pack.deletedAt !== null) {
			throw new NotFoundException('Emoji pack not found')
		}

		if (pack.ownerId !== userId) {
			throw new ForbiddenException('Only the owner can delete an emoji pack')
		}

		await this.prisma.$transaction(async tx => {
			await tx.userEmojiPack.deleteMany({ where: { packId } })

			await tx.emojiPack.update({
				where: { id: packId },
				data: { deletedAt: BigInt(Date.now()) }
			})
		})
	}

	async installPack(userId: UserId, packId: EmojiPackId): Promise<void> {
		const pack = await this.prisma.emojiPack.findUnique({
			where: { id: packId },
			select: { id: true, deletedAt: true }
		})

		if (!pack || pack.deletedAt !== null) {
			throw new NotFoundException('Emoji pack not found')
		}

		const last = await this.prisma.userEmojiPack.findFirst({
			where: { userId },
			orderBy: { sortOrder: 'desc' },
			select: { sortOrder: true }
		})

		await this.prisma.userEmojiPack.upsert({
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

	async uninstallPack(userId: UserId, packId: EmojiPackId): Promise<void> {
		await this.prisma.userEmojiPack.deleteMany({ where: { userId, packId } })
	}

	initEmojiUpload(dto: EmojiUploadInitDto): Promise<InitUploadDto> {
		const packId = EmojiPackId(dto.packId)

		return this.storage.initUpload({
			name: dto.name,
			size: dto.size,
			mimeType: dto.mimeType,
			category: UploadCategory.EMOJI,
			directory: FileType.EMOJI,
			subdirectory: packId.toString(),
			width: dto.width,
			height: dto.height
		})
	}

	confirmEmojiUpload(fileId: string): Promise<FileDto> {
		return this.storage.confirmUpload(fileId)
	}

	private async findPackDetail(
		userId: UserId,
		where: { id: bigint } | { username: string },
		allowDeleted = false
	): Promise<EmojiPackResponseDto> {
		const pack = await this.prisma.emojiPack.findUnique({
			where,
			include: {
				cover: { select: { path: true } },
				emojis: {
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

		if (!pack || (pack.deletedAt !== null && !allowDeleted)) {
			throw new NotFoundException('Emoji pack not found')
		}

		return this.toPackDto(pack, {
			emojiCount: pack.emojis.length,
			isOwned: pack.ownerId === userId,
			isInstalled: pack.installs.length > 0,
			emojis: pack.emojis
		})
	}

	private async assertPackIdFree(packId: EmojiPackId): Promise<void> {
		const existing = await this.prisma.emojiPack.findUnique({
			where: { id: packId },
			select: { id: true }
		})

		if (existing) {
			throw new ConflictException('Emoji pack already exists')
		}
	}

	private async assertEmojiFileUsable(fileId: string): Promise<void> {
		await this.assertEmojiFilesUsable([fileId])
	}

	private async assertEmojiFilesUsable(fileIds: string[]): Promise<void> {
		const uniqueIds = new Set(fileIds)

		if (uniqueIds.size !== fileIds.length) {
			throw new ConflictException('Emoji pack contains the same emoji twice')
		}

		const files = await this.prisma.file.findMany({
			where: { id: { in: [...uniqueIds] } },
			select: { id: true, path: true, status: true, mimeType: true }
		})

		if (files.length !== uniqueIds.size) {
			throw new NotFoundException('Emoji file not found')
		}

		for (const file of files) {
			if (file.status !== FileStatus.UPLOADED) {
				throw new ConflictException('Emoji upload not completed')
			}

			if (!file.path.startsWith(`${FileType.EMOJI}/`)) {
				throw new ConflictException('File is not an emoji')
			}

			if (file.mimeType !== EMOJI_MIME_TYPE) {
				throw new ConflictException('Emoji must be a WebP image')
			}
		}
	}

	private async assertUsernameFree(username: string): Promise<void> {
		const existing = await this.prisma.emojiPack.findUnique({
			where: { username },
			select: { id: true }
		})

		if (existing) {
			throw new ConflictException('Emoji pack username is already taken')
		}
	}

	private normalizeUsername(username: string): string {
		return username.trim().toLowerCase()
	}

	private isUsernameWellFormed(username: string): boolean {
		return (
			username.length >= MIN_EMOJI_PACK_USERNAME_LENGTH &&
			username.length <= MAX_EMOJI_PACK_USERNAME_LENGTH &&
			EMOJI_PACK_USERNAME_PATTERN.test(username)
		)
	}

	private mapUsernameConflict(error: unknown): unknown {
		const code = (error as { code?: string } | null)?.code

		if (code === 'P2002') {
			return new ConflictException('Emoji pack username is already taken')
		}

		return error
	}

	private toPackDto(pack: PackRow, view: PackView): EmojiPackResponseDto {
		const coverPath =
			pack.cover?.path ?? view.emojis[0]?.file.path ?? view.coverFallbackPath ?? null

		return plainToInstance(EmojiPackResponseDto, {
			id: pack.id.toString(),
			name: pack.name,
			username: pack.username,
			ownerId: pack.ownerId.toString(),
			coverFileId: pack.coverFileId ?? undefined,
			coverUrl: coverPath ? this.storage.getPublicUrl(coverPath) : undefined,
			emojiCount: view.emojiCount,
			isOwned: view.isOwned,
			isInstalled: view.isInstalled,
			emojis: view.emojis.map(emoji => ({
				id: emoji.id.toString(),
				fileId: emoji.fileId,
				url: this.storage.getPublicUrl(emoji.file.path),
				emojis: emoji.emojis,
				sortOrder: emoji.sortOrder
			}))
		})
	}
}

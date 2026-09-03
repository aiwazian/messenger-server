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
	sortOrder: number
	file: { path: string }
}

/** То, чего нет в самом наборе и что зависит от спрашивающего. */
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

	/**
	 * Наборы, созданные самим пользователем.
	 *
	 * Сами стикеры не грузятся: списку нужны только название и счётчик,
	 * а пара десятков наборов целиком — это уже тысячи ссылок в ответе.
	 */
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

	/** Наборы, добавленные по ссылке, в порядке панели стикеров. */
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

	/**
	 * Один набор целиком — со стикерами и готовыми ссылками.
	 *
	 * Виден любому, кто знает идентификатор: набор распространяется
	 * ссылкой, а картинки и так лежат в публичном бакете. Право на правку
	 * проверяется отдельно в updatePack и deletePack.
	 */
	getPack(userId: UserId, packId: StickerPackId): Promise<StickerPackResponseDto> {
		return this.findPackDetail(userId, { id: packId })
	}

	/** То же самое, но по имени из ссылки на добавление. */
	getPackByUsername(userId: UserId, username: string): Promise<StickerPackResponseDto> {
		return this.findPackDetail(userId, { username: this.normalizeUsername(username) })
	}

	/**
	 * Проверка имени для подсказки под полем ввода.
	 *
	 * packId передаётся при редактировании: своё же имя не должно
	 * считаться занятым, иначе набор нельзя было бы сохранить, не меняя имя.
	 *
	 * Неверный формат — тоже «недоступно», а не ошибка: поле проверяется
	 * на каждом символе, и недонабранное имя не повод показывать ошибку.
	 */
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

	/**
	 * Создание набора целиком: название, имя и сразу все стикеры.
	 *
	 * Набор появляется только в момент сохранения, а не по вводу названия:
	 * иначе брошенный на полпути экран оставлял бы пустые наборы и занимал
	 * имена.
	 */
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
						create: fileIds.map((fileId, index) => ({
							fileId,
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

	/**
	 * Изменение набора: название, имя и состав стикеров.
	 *
	 * Состав приходит полным списком, поэтому выпавшие стикеры удаляются,
	 * оставшиеся только перенумеровываются, а новые добавляются в конец.
	 * Пересоздавать все строки нельзя: у стикера есть идентификатор, на который
	 * ссылаются уже отправленные сообщения.
	 */
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

		const desiredFileIds = dto.stickers?.map(sticker => sticker.fileId)

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

				if (!desiredFileIds) {
					return
				}

				await tx.sticker.deleteMany({
					where: { packId, fileId: { notIn: desiredFileIds } }
				})

				const now = BigInt(Date.now())
				const existingByFileId = new Map(
					pack.stickers.map(sticker => [sticker.fileId, sticker.id])
				)

				for (const [index, fileId] of desiredFileIds.entries()) {
					const existingId = existingByFileId.get(fileId)

					if (existingId !== undefined) {
						await tx.sticker.update({
							where: { id: existingId },
							data: { sortOrder: index }
						})

						continue
					}

					await tx.sticker.create({
						data: { packId, fileId, sortOrder: index, createdAt: now }
					})
				}
			})
		} catch (error) {
			throw this.mapUsernameConflict(error)
		}

		/*
		 * Файлы отпускаются после транзакции, а не внутри: удаление в хранилище
		 * нельзя откатить вместе с базой. release сам считает ссылки: картинка
		 * могла остаться в другом наборе.
		 */
		for (const fileId of removedFileIds) {
			await this.storage.releaseFile(fileId)
		}

		return this.getPack(userId, packId)
	}

	/**
	 * Удаление набора у всех.
	 *
	 * Стикеры и установки уходят каскадом, поэтому список файлов читается
	 * заранее: после удаления узнать, что было в наборе, уже негде.
	 */
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

	/**
	 * Добавление набора себе.
	 *
	 * upsert, а не create: по ссылке можно перейти дважды, и второе добавление
	 * должно молча ничего не менять, а не отвечать ошибкой.
	 */
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

	/**
	 * Удаление набора только у себя.
	 *
	 * deleteMany вместо delete: повторное удаление и удаление того, чего не
	 * было, — не ошибка, а уже достигнутый результат.
	 */
	async uninstallPack(userId: UserId, packId: StickerPackId): Promise<void> {
		await this.prisma.userStickerPack.deleteMany({ where: { userId, packId } })
	}

	/**
	 * Форма для загрузки картинки стикера.
	 *
	 * Каталог и категорию задаёт сервер, а не клиент: иначе по этому
	 * эндпоинту можно было бы получить форму в приватный каталог или с чужим
	 * пределом размера.
	 */
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

	/**
	 * Проверка файлов перед тем, как они станут стикерами.
	 *
	 * Самое важное здесь — каталог: ссылка на стикер собирается как публичная,
	 * и файл из приватного бакета просто не открылся бы у получателя — и
	 * выяснилось бы это уже после отправки набора в чат.
	 */
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

	/**
	 * Гонка за именем: проверка занятости и вставка не атомарны.
	 *
	 * Два пользователя могут сохранить набор с одним именем одновременно:
	 * первый пройдёт, второй упрётся в уникальный индекс. Без этого разбора
	 * он получил бы 500 вместо понятного «имя занято».
	 */
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
				sortOrder: sticker.sortOrder
			}))
		})
	}
}

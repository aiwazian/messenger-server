import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { FileStatus } from '../../../generated/prisma/enums'
import { FileType } from '../../../common/enums/file-type.enum'
import { resolveFileExtension } from '../constants/file-extensions'

export interface CreatePendingFileInput {
	name: string
	size: number
	mimeType: string
	directory: FileType
	subdirectory?: string
	width?: number
	height?: number
}

@Injectable()
export class FileRegistryService {
	constructor(private readonly prisma: PrismaService) {}

	async createPending(input: CreatePendingFileInput) {
		const id = randomUUID()
		const extension = resolveFileExtension(input.mimeType, input.name)
		const folder = input.subdirectory
			? `${input.directory}/${input.subdirectory}`
			: input.directory

		return this.prisma.file.create({
			data: {
				id,
				name: input.name,
				size: input.size,
				mimeType: input.mimeType,
				path: `${folder}/${id}${extension}`,
				status: FileStatus.PENDING,
				createdAt: Date.now(),
				width: input.width ?? null,
				height: input.height ?? null
			}
		})
	}

	async findByIdOrFail(fileId: string) {
		const file = await this.prisma.file.findUnique({ where: { id: fileId } })
		if (!file) throw new NotFoundException('File not found')

		return file
	}

	async markUploaded(fileId: string, mimeType: string) {
		return this.prisma.file.update({
			where: { id: fileId },
			data: {
				status: FileStatus.UPLOADED,
				mimeType
			}
		})
	}

	async scheduleDeletion(fileId: string): Promise<void> {
		const file = await this.prisma.file.findUnique({ where: { id: fileId } })
		if (!file) return

		await this.prisma.fileCleanupTask.create({
			data: {
				fileId,
				filePath: file.path,
				createdAt: Date.now(),
				nextRetry: Date.now(),
				attempts: 0
			}
		})

		await this.prisma.file.delete({ where: { id: fileId } })
	}

	async release(fileId: string): Promise<void> {
		const [
			attachments,
			userPhotos,
			channelPhotos,
			groupPhotos,
			wallpapers,
			stickers,
			stickerPackCovers
		] = await Promise.all([
			this.prisma.messageAttachment.count({ where: { fileId } }),
			this.prisma.userPhoto.count({ where: { fileId } }),
			this.prisma.channelPhoto.count({ where: { fileId } }),
			this.prisma.groupPhoto.count({ where: { fileId } }),
			this.prisma.wallpaper.count({ where: { fileId } }),
			this.prisma.sticker.count({ where: { fileId } }),
			this.prisma.stickerPack.count({ where: { coverFileId: fileId } })
		])

		const references =
			attachments +
			userPhotos +
			channelPhotos +
			groupPhotos +
			wallpapers +
			stickers +
			stickerPackCovers

		if (references > 0) {
			return
		}

		await this.scheduleDeletion(fileId)
	}
}

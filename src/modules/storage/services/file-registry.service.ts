import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { FileStatus } from '../../../generated/prisma/enums'
import { FileType } from '../../../common/enums/file-type.enum'

export interface CreatePendingFileInput {
	name: string
	size: number
	mimeType: string
	directory: FileType
	/** Размеры кадра в пикселях. Есть только у фото и видео. */
	width?: number
	height?: number
}

/**
 * Учёт файлов в базе.
 *
 * Отделён от работы с хранилищем: здесь только записи File и FileCleanupTask,
 * ни одного вызова S3.
 */
@Injectable()
export class FileRegistryService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Запись создаётся до загрузки: путь в бакете строится из её идентификатора,
	 * а он же подписывается в политике, поэтому клиент не может выбрать ключ сам.
	 *
	 * Размеры кадра пишутся сразу здесь, а не при подтверждении: подтверждение
	 * знает только о самом объекте в бакете, а измерил кадр отправитель ещё до
	 * загрузки.
	 */
	async createPending(input: CreatePendingFileInput) {
		const id = randomUUID()

		return this.prisma.file.create({
			data: {
				id,
				name: input.name,
				size: input.size,
				mimeType: input.mimeType,
				path: `${input.directory}/${id}`,
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

	/**
	 * Ставит объект в очередь на удаление и убирает запись.
	 *
	 * Удаление в бакете может не пройти с первого раза, поэтому задача
	 * переживает перезапуск: сначала пишем её, потом удаляем строку.
	 */
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

	/**
	 * Удаляет файл, только если на него не осталось ни одной ссылки.
	 *
	 * Один и тот же File может быть и аватаром, и вложением пересланного
	 * сообщения: безусловное удаление ломало бы чужой контент.
	 */
	async release(fileId: string): Promise<void> {
		const [attachments, userPhotos, channelPhotos, groupPhotos, wallpapers] = await Promise.all([
			this.prisma.messageAttachment.count({ where: { fileId } }),
			this.prisma.userPhoto.count({ where: { fileId } }),
			this.prisma.channelPhoto.count({ where: { fileId } }),
			this.prisma.groupPhoto.count({ where: { fileId } }),
			this.prisma.wallpaper.count({ where: { fileId } })
		])

		if (attachments + userPhotos + channelPhotos + groupPhotos + wallpapers > 0) return

		await this.scheduleDeletion(fileId)
	}
}

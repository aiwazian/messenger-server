import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../../providers/prisma/prisma.service'
import { FileStatus } from '../../../generated/prisma/enums'
import { OBJECT_STORAGE, ObjectStoragePort } from '../ports/object-storage.port'
import { resolveBucketForKey } from '../constants/bucket-routing'

/**
 * Фоновая уборка хранилища.
 *
 * Вынесена из StorageService: расписание и повторные попытки не имеют
 * отношения ни к выдаче ссылок, ни к подтверждению загрузки.
 */
@Injectable()
export class FileCleanupService {
	private readonly logger = new Logger(FileCleanupService.name)

	constructor(
		private readonly prisma: PrismaService,
		@Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStoragePort
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async processFileCleanupTasks(): Promise<void> {
		await this.retryPendingDeletions()
		await this.purgeAbandonedUploads()
	}

	private async retryPendingDeletions(): Promise<void> {
		const now = Date.now()

		const tasks = await this.prisma.fileCleanupTask.findMany({
			where: { nextRetry: { lte: now } },
			take: 50
		})

		for (const task of tasks) {
			try {
				await this.objectStorage.deleteObject(
					task.filePath,
					resolveBucketForKey(task.filePath)
				)
				await this.prisma.fileCleanupTask.delete({ where: { id: task.id } })
			} catch (error: any) {
				this.logger.warn(`Retry failed for file ${task.filePath}: ${error.message}`)
				await this.prisma.fileCleanupTask.update({
					where: { id: task.id },
					data: {
						attempts: task.attempts + 1,
						nextRetry: now + 1000 * 60 * 60
					}
				})
			}
		}
	}

	/**
	 * Загрузки, которые так и не подтвердили.
	 *
	 * Форма живёт час, поэтому через сутки запись заведомо мусорная: либо файл
	 * не отправили, либо подтверждение не дошло.
	 */
	private async purgeAbandonedUploads(): Promise<void> {
		const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000

		const expired = await this.prisma.file.findMany({
			where: {
				status: FileStatus.PENDING,
				createdAt: { lte: oneDayAgo }
			},
			take: 50
		})

		for (const file of expired) {
			try {
				await this.objectStorage.deleteObject(file.path, resolveBucketForKey(file.path))
				await this.prisma.file.delete({ where: { id: file.id } })
			} catch (error: any) {
				this.logger.warn(`Failed to purge abandoned upload ${file.path}: ${error.message}`)
			}
		}
	}
}

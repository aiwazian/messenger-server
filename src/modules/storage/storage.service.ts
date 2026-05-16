import { Injectable, NotFoundException } from '@nestjs/common'
import {
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	S3Client
} from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { InitUploadDto } from './dto/init-upload.dto'
import { plainToInstance } from 'class-transformer'
import { FileDto } from './dto/file.dto'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { FileStatus } from '../../../generated/prisma/enums'
import { FileType } from '../../common/enums/file-type.enum'

@Injectable()
export class StorageService {
	private s3Client: S3Client
	private bucketName: string

	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService
	) {
		this.s3Client = new S3Client({
			region: config.get('S3_REGION')!,
			endpoint: config.get('S3_END_POINT')!,
			credentials: {
				accessKeyId: config.get('S3_ACCESS_KEY')!,
				secretAccessKey: config.get('S3_SECRET_KEY')!
			},
			forcePathStyle: true
		})
		this.bucketName = config.get('S3_BUCKET_NAME')!
	}

	async initUpload(
		name: string,
		size: number,
		mimeType: string,
		fileType: FileType = FileType.CHAT_ATTACHMENT
	): Promise<InitUploadDto> {
		const id = uuidv4()
		const path = `${fileType}/${id}/${name}`

		const file = await this.prisma.file.create({
			data: {
				id,
				name,
				size: BigInt(size),
				mimeType,
				path,
				status: FileStatus.PENDING,
				createdAt: Date.now()
			}
		})

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: path
		})

		const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 })

		return plainToInstance(InitUploadDto, {
			signedUrl: signedUrl,
			fileId: file.id
		})
	}

	async confirmUpload(fileId: string): Promise<FileDto> {
		const exists = await this.prisma.file.findUnique({ where: { id: fileId } })
		if (!exists) throw new NotFoundException('File not found')

		const file = await this.prisma.file.update({
			where: { id: fileId },
			data: {
				status: FileStatus.UPLOADED
			}
		})

		return plainToInstance(FileDto, file)
	}

	async deleteFile(fileId: string) {
		const file = await this.prisma.file.findUnique({ where: { id: fileId } })
		if (!file) return

		await this.prisma.fileCleanupTask.create({
			data: {
				fileId,
				filePath: file.path,
				createdAt: Date.now(),
				nextRetry: Date.now() + 1000 * 60 * 60, // 1 hour
				attempts: 1
			}
		})

		await this.prisma.file.delete({ where: { id: fileId } })
	}

	@Cron(CronExpression.EVERY_HOUR)
	async processFileCleanupTasks() {
		const now = Date.now()
		const oneDayAgo = now - 24 * 60 * 60 * 1000

		// 1. Process cleanup tasks
		const tasks = await this.prisma.fileCleanupTask.findMany({
			where: {
				nextRetry: { lte: now }
			},
			take: 50
		})

		for (const task of tasks) {
			try {
				await this.s3Client.send(
					new DeleteObjectCommand({
						Bucket: this.bucketName,
						Key: task.filePath
					})
				)
				await this.prisma.fileCleanupTask.delete({ where: { id: task.id } })
			} catch (e) {
				console.error(`Retry failed for file ${task.filePath}: ${(e as Error).message}`)
				await this.prisma.fileCleanupTask.update({
					where: { id: task.id },
					data: {
						attempts: task.attempts + 1,
						nextRetry: now + 1000 * 60 * 60 // 1 hour
					}
				})
			}
		}

		// 2. Cleanup expired PENDING files
		const expiredPendingFiles = await this.prisma.file.findMany({
			where: {
				status: FileStatus.PENDING,
				createdAt: { lte: oneDayAgo }
			},
			take: 50
		})

		for (const file of expiredPendingFiles) {
			try {
				await this.s3Client.send(
					new DeleteObjectCommand({
						Bucket: this.bucketName,
						Key: file.path
					})
				)
				await this.prisma.file.delete({ where: { id: file.id } })
			} catch (e) {
				console.error(`Cleanup failed for expired pending file ${file.path}: ${(e as Error).message}`)
			}
		}
	}

	async getDownloadUrl(fileId: string): Promise<FileDownloadDto> {
		const file = await this.prisma.file.findUnique({ where: { id: fileId } })
		if (!file) throw new NotFoundException('File not found')

		if (file.status !== FileStatus.UPLOADED) {
			throw new Error('File upload not completed')
		}

		const command = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: file.path
		})

		const downloadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 })

		return plainToInstance(FileDownloadDto, {
			downloadUrl,
			name: file.name,
			size: file.size,
			mimeType: file.mimeType
		})
	}

	async initUserAvatarUpload(name: string, size: number, mimeType: string): Promise<InitUploadDto> {
		if (!['image/png', 'image/jpeg', 'image/jpg'].includes(mimeType)) {
			throw new Error('Invalid mime type')
		}
		return this.initUpload(name, size, mimeType, FileType.USER_AVATAR)
	}

	async initChannelAvatarUpload(
		name: string,
		size: number,
		mimeType: string
	): Promise<InitUploadDto> {
		if (!['image/png', 'image/jpeg', 'image/jpg'].includes(mimeType)) {
			throw new Error('Invalid mime type')
		}
		return this.initUpload(name, size, mimeType, FileType.CHANNEL_AVATAR)
	}

	async initGroupAvatarUpload(
		name: string,
		size: number,
		mimeType: string
	): Promise<InitUploadDto> {
		if (!['image/png', 'image/jpeg', 'image/jpg'].includes(mimeType)) {
			throw new Error('Invalid mime type')
		}
		return this.initUpload(name, size, mimeType, FileType.GROUP_AVATAR)
	}
}

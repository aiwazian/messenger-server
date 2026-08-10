import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	S3Client,
	CopyObjectCommand,
	MetadataDirective
} from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { InitUploadDto } from './dto/init-upload.dto'
import { plainToInstance } from 'class-transformer'
import { FileDto } from './dto/file.dto'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { FileStatus } from '../../generated/prisma/enums'
import { FileType } from '../../common/enums/file-type.enum'
import { fileTypeFromBuffer } from 'file-type'

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
		fileType: FileType = FileType.CHAT_ATTACHMENT
	): Promise<InitUploadDto> {
		const id = randomUUID()
		const path = `${fileType}/${id}`

		const file = await this.prisma.file.create({
			data: {
				id,
				name,
				size,
				mimeType: 'application/octet-stream',
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
		const file = await this.prisma.file.findUnique({ where: { id: fileId } })
		if (!file) throw new NotFoundException('File not found')

		let realMime = 'application/octet-stream'
		try {
			const getCmd = new GetObjectCommand({
				Bucket: this.bucketName,
				Key: file.path,
				Range: 'bytes=0-4095'
			})

			const response = await this.s3Client.send(getCmd)
			const chunks: Buffer[] = []
			for await (const chunk of response.Body as AsyncIterable<Buffer>) {
				chunks.push(chunk)
			}

			const headerBuffer = Buffer.concat(chunks)
			const detected = await fileTypeFromBuffer(headerBuffer)
			if (detected) {
				realMime = detected.mime
			}

			if (realMime !== file.mimeType) {
				await this.s3Client.send(
					new CopyObjectCommand({
						Bucket: this.bucketName,
						CopySource: `${this.bucketName}/${file.path}`,
						Key: file.path,
						ContentType: realMime,
						MetadataDirective: MetadataDirective.REPLACE
					})
				)
			}
		} catch (error) {
			console.error(`Failed to process file header for ${file.path}: ${(error as Error).message}`)
		}

		const updated = await this.prisma.file.update({
			where: { id: fileId },
			data: {
				status: FileStatus.UPLOADED,
				mimeType: realMime
			}
		})

		return plainToInstance(FileDto, updated)
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
			} catch (e) {}
		}
	}

	async getDownloadUrl(fileId: string): Promise<FileDownloadDto> {
		const file = await this.prisma.file.findUnique({ where: { id: fileId } })
		if (!file) throw new NotFoundException('File not found')

		if (file.status !== FileStatus.UPLOADED) {
			throw new ConflictException('File upload not completed')
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
}

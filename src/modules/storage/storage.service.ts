import { Injectable, NotFoundException } from '@nestjs/common'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { FileStatus } from 'generated/prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { InitUploadDto } from './dto/init-upload.dto'
import { plainToInstance } from 'class-transformer'
import { FileDto } from './dto/file.dto'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { Cron, CronExpression } from '@nestjs/schedule'

@Injectable()
export class StorageService {
    private s3Client: S3Client
    private bucketName: string

    constructor(
        private readonly config: ConfigService,
        private readonly prisma: PrismaService
    ) {
        this.s3Client = new S3Client({
            region: config.get("S3_REGION"),
            endpoint: config.get("S3_END_POINT"),
            credentials: {
                accessKeyId: config.get("S3_ACCESS_KEY"),
                secretAccessKey: config.get("S3_SECRET_KEY")
            },
            forcePathStyle: true
        })
        this.bucketName = config.get("S3_BUCKET_NAME")
    }

    async initUpload(name: string, size: number, mimeType: string): Promise<InitUploadDto> {
        const id = uuidv4()
        const path = `files/${id}/${name}`

        const file = await this.prisma.file.create({
            data: {
                id,
                name,
                size: BigInt(size),
                mimeType,
                path,
                status: FileStatus.PENDING,
                createdAt: Date.now(),
                updatedAt: Date.now()
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
                status: FileStatus.COMPLETED,
                updatedAt: Date.now()
            }
        })

        return plainToInstance(FileDto, file)
    }

    async deleteFile(fileId: string) {
        const file = await this.prisma.file.findUnique({ where: { id: fileId } })
        if (!file) return

        const path = file.path
        await this.prisma.file.delete({ where: { id: fileId } })

        // Asynchronously schedule deletion from S3
        this.scheduleS3Deletion(fileId, path)
    }

    async scheduleS3Deletion(fileId: string, filePath: string) {
        // Try immediately
        try {
            await this.s3Client.send(new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: filePath
            }))
        } catch (e) {
            console.error(`Failed to delete file ${filePath} from S3, scheduling retry`, e)
            await this.prisma.fileCleanupTask.create({
                data: {
                    fileId,
                    filePath,
                    createdAt: Date.now(),
                    nextRetry: Date.now() + 1000 * 60 * 60, // 1 hour
                    attempts: 1,
                    lastError: e.message
                }
            })
        }
    }

    @Cron(CronExpression.EVERY_HOUR)
    async processFileCleanupTasks() {
        const now = Date.now()
        const tasks = await this.prisma.fileCleanupTask.findMany({
            where: {
                nextRetry: { lte: now }
            },
            take: 50 // process in batches
        })

        for (const task of tasks) {
            try {
                await this.s3Client.send(new DeleteObjectCommand({
                    Bucket: this.bucketName,
                    Key: task.filePath
                }))
                await this.prisma.fileCleanupTask.delete({ where: { id: task.id } })
            } catch (e) {
                console.error(`Retry failed for file ${task.filePath}: ${e.message}`)
                await this.prisma.fileCleanupTask.update({
                    where: { id: task.id },
                    data: {
                        attempts: task.attempts + 1,
                        lastError: e.message,
                        nextRetry: now + 1000 * 60 * 60 // 1 hour
                    }
                })
            }
        }
    }

    async getDownloadUrl(fileId: string): Promise<FileDownloadDto> {
        const file = await this.prisma.file.findUnique({ where: { id: fileId } })
        if (!file) throw new NotFoundException('File not found')

        if (file.status !== FileStatus.COMPLETED) {
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
            size: file.size.toString(),
            mimeType: file.mimeType
        })
    }
}

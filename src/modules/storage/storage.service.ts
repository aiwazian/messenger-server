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

        try {
            await this.s3Client.send(new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: file.path
            }))
        } catch (e) {
            console.error(`Failed to delete file ${file.path} from S3`, e)
        }

        await this.prisma.file.delete({ where: { id: fileId } })
    }

    async getDownloadUrl(fileId: string) {
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

        return {
            downloadUrl,
            name: file.name,
            size: file.size.toString(),
            mimeType: file.mimeType
        }
    }
}

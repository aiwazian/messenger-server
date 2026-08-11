import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
	CreateDownloadUrlInput,
	CreateUploadFormInput,
	ObjectStoragePort,
	PresignedUploadForm
} from '../ports/object-storage.port'

/** Реализация порта хранилища поверх S3-совместимого API. */
@Injectable()
export class S3ObjectStorage implements ObjectStoragePort {
	private readonly client: S3Client
	private readonly bucketName: string

	constructor(private readonly config: ConfigService) {
		this.client = new S3Client({
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

	/**
	 * Форма presigned POST.
	 *
	 * Условия политики подписаны сервером, поэтому проверка выполняется на
	 * стороне S3: клиент не может ни поднять лимит размера, ни подменить
	 * Content-Type — S3 отклонит такой POST целиком, файл в бакет не попадёт.
	 * У PUT по подписанной ссылке такой возможности не было вовсе: подписывался
	 * только путь, а тело и заголовки оставались на совести клиента.
	 */
	async createUploadForm(input: CreateUploadFormInput): Promise<PresignedUploadForm> {
		const { url, fields } = await createPresignedPost(this.client, {
			Bucket: this.bucketName,
			Key: input.key,
			Expires: input.expiresInSeconds,
			Fields: {
				'Content-Type': input.contentType
			},
			Conditions: [
				['content-length-range', input.minSizeBytes, input.maxSizeBytes],
				['eq', '$Content-Type', input.contentType]
			]
		})

		return { url, fields }
	}

	async createDownloadUrl(input: CreateDownloadUrlInput): Promise<string> {
		const command = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: input.key
		})

		return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds })
	}

	async readHead(key: string, byteLength: number): Promise<Buffer> {
		const response = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Range: `bytes=0-${byteLength - 1}`
			})
		)

		const chunks: Buffer[] = []
		for await (const chunk of response.Body as AsyncIterable<Buffer>) {
			chunks.push(chunk)
		}

		return Buffer.concat(chunks)
	}

	async deleteObject(key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: this.bucketName,
				Key: key
			})
		)
	}
}

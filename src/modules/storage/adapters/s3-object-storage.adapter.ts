import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutBucketPolicyCommand,
	S3Client
} from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
	ApplyPublicReadPolicyInput,
	CreateDownloadUrlInput,
	CreateUploadFormInput,
	ObjectStoragePort,
	PresignedUploadForm,
	StorageBucket
} from '../ports/object-storage.port'
import { buildPublicReadPolicy } from './bucket-policy'

/**
 * Разбор ошибки S3 в читаемую строку.
 *
 * На часть операций провайдеры отвечают телом, которое SDK не умеет
 * разобрать, и тогда в лог попадает одно слово UnknownError. По нему нельзя
 * отличить нехватку прав у ключа от неподдерживаемой операции, поэтому сюда
 * собираются HTTP-статус и код ошибки из метаданных ответа.
 */
function describeS3Error(error: unknown): string {
	if (!(error instanceof Error)) {
		return String(error)
	}

	const details = error as Error & {
		Code?: string
		$fault?: string
		$metadata?: { httpStatusCode?: number }
	}

	const parts = [error.name]

	if (error.message && error.message !== error.name) {
		parts.push(error.message)
	}

	if (details.Code && details.Code !== error.name) {
		parts.push(`code ${details.Code}`)
	}

	if (details.$metadata?.httpStatusCode) {
		parts.push(`HTTP ${details.$metadata.httpStatusCode}`)
	}

	if (details.$fault) {
		parts.push(`fault ${details.$fault}`)
	}

	return parts.join(', ')
}

/** Реализация порта хранилища поверх S3-совместимого API. */
@Injectable()
export class S3ObjectStorage implements ObjectStoragePort {
	private readonly client: S3Client

	/**
	 * Имена бакетов по роли.
	 *
	 * Один клиент на обе роли: ключи доступа у провайдера общие для
	 * всего аккаунта, поэтому бакеты отличаются только именем.
	 *
	 * Роли могут смотреть в один и тот же бакет: различаются они способом
	 * раздачи — постоянная ссылка против подписанной, — а не обязательно
	 * местом хранения.
	 */
	private readonly buckets: Record<StorageBucket, string>

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

		/*
		 * Отдельное имя для публичных файлов необязательно.
		 *
		 * Открытый доступ к стикерам даётся либо политикой бакета на
		 * префикс stickers/, либо вторым бакетом. В первом случае
		 * переменная не нужна: всё лежит в одном бакете.
		 */
		const bucketName = config.get<string>('S3_BUCKET_NAME')!

		this.buckets = {
			[StorageBucket.PRIVATE]: bucketName,
			[StorageBucket.PUBLIC]: config.get<string>('S3_PUBLIC_BUCKET_NAME') ?? bucketName
		}
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
			Bucket: this.buckets[input.bucket],
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
			Bucket: this.buckets[input.bucket],
			Key: input.key
		})

		return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds })
	}

	async readHead(key: string, byteLength: number, bucket: StorageBucket): Promise<Buffer> {
		const response = await this.client.send(
			new GetObjectCommand({
				Bucket: this.buckets[bucket],
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

	async deleteObject(key: string, bucket: StorageBucket): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: this.buckets[bucket],
				Key: key
			})
		)
	}

	/**
	 * Политика анонимного чтения каталогов.
	 *
	 * Имя бакета подставляется здесь: вызывающий знает только роль и список
	 * каталогов, а то, в каком бакете они лежат, — дело адаптера.
	 *
	 * Ошибка перебрасывается с текстом ответа: без него вызывающий не сможет
	 * написать в лог ничего, кроме слова UnknownError.
	 */
	async applyPublicReadPolicy(input: ApplyPublicReadPolicyInput): Promise<void> {
		const bucket = this.buckets[input.bucket]

		try {
			await this.client.send(
				new PutBucketPolicyCommand({
					Bucket: bucket,
					Policy: buildPublicReadPolicy(bucket, input.directories)
				})
			)
		} catch (error) {
			throw new Error(`Bucket ${bucket}: ${describeS3Error(error)}`)
		}
	}
}

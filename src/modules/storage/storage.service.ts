import { ConflictException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { plainToInstance } from 'class-transformer'
import { fileTypeFromBuffer } from 'file-type'
import { InitUploadDto } from './dto/init-upload.dto'
import { FileDto } from './dto/file.dto'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { OBJECT_STORAGE, ObjectStoragePort, StorageBucket } from './ports/object-storage.port'
import {
	PUBLIC_DIRECTORIES,
	resolveBucketForDirectory,
	resolveBucketForKey
} from './constants/bucket-routing'
import { FileRegistryService } from './services/file-registry.service'
import { UploadPolicyService } from './services/upload-policy.service'
import { FileStatus } from '../../generated/prisma/enums'
import { FileType } from '../../common/enums/file-type.enum'
import { UploadCategory } from '../../common/enums/upload-category.enum'
import {
	DOWNLOAD_URL_TTL_SECONDS,
	MIME_SNIFF_BYTES,
	UPLOAD_URL_TTL_SECONDS
} from './constants/upload.constants'

export interface InitUploadInput {
	name: string
	size: number
	mimeType: string
	category?: UploadCategory
	directory: FileType
	subdirectory?: string
	width?: number
	height?: number
}

@Injectable()
export class StorageService implements OnModuleInit {
	private readonly logger = new Logger(StorageService.name)

	private readonly publicBaseUrl: string

	constructor(
		@Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStoragePort,
		private readonly files: FileRegistryService,
		private readonly policy: UploadPolicyService,
		config: ConfigService
	) {
		this.publicBaseUrl = config.get<string>('CDN_PUBLIC_BASE_URL')!.replace(/\/+$/, '')
	}

	async onModuleInit(): Promise<void> {
		try {
			await this.objectStorage.applyPublicReadPolicy({
				bucket: StorageBucket.PUBLIC,
				directories: PUBLIC_DIRECTORIES
			})

			this.logger.log(`Public read access granted to ${PUBLIC_DIRECTORIES.join(', ')}`)
		} catch (error) {
			this.logger.error(
				`Failed to grant public read access: ${error instanceof Error ? error.message : error}`
			)
		}
	}

	async initUpload(input: InitUploadInput): Promise<InitUploadDto> {
		const category = input.category ?? UploadCategory.FILE
		const maxSizeBytes = this.policy.maxSizeBytesFor(category)

		this.policy.assertSizeAllowed(input.size, category)
		this.policy.assertDeclaredMimeAllowed(category, input.mimeType)

		const file = await this.files.createPending({
			name: input.name,
			size: input.size,
			mimeType: input.mimeType,
			directory: input.directory,
			subdirectory: input.subdirectory,
			width: input.width,
			height: input.height
		})

		const form = await this.objectStorage.createUploadForm({
			key: file.path,
			bucket: resolveBucketForDirectory(input.directory),
			contentType: input.mimeType,
			minSizeBytes: this.policy.minSizeBytes,
			maxSizeBytes,
			expiresInSeconds: UPLOAD_URL_TTL_SECONDS
		})

		return plainToInstance(InitUploadDto, {
			url: form.url,
			fields: form.fields,
			fileId: file.id,
			maxSizeBytes
		})
	}

	async confirmUpload(fileId: string): Promise<FileDto> {
		const file = await this.files.findByIdOrFail(fileId)

		if (file.status === FileStatus.UPLOADED) {
			return plainToInstance(FileDto, file)
		}

		let detectedMime: string | undefined
		try {
			const head = await this.objectStorage.readHead(
				file.path,
				MIME_SNIFF_BYTES,
				resolveBucketForKey(file.path)
			)
			detectedMime = (await fileTypeFromBuffer(head))?.mime
		} catch {
			throw new ConflictException('File was not uploaded')
		}

		try {
			this.policy.assertContentMatchesDeclared(file.mimeType, detectedMime)
		} catch (error) {
			await this.files.scheduleDeletion(fileId)
			throw error
		}

		const updated = await this.files.markUploaded(
			fileId,
			this.policy.resolveStoredMime(file.mimeType, detectedMime)
		)

		return plainToInstance(FileDto, updated)
	}

	async getDownloadUrl(fileId: string): Promise<FileDownloadDto> {
		const file = await this.files.findByIdOrFail(fileId)

		if (file.status !== FileStatus.UPLOADED) {
			throw new ConflictException('File upload not completed')
		}

		const downloadUrl =
			resolveBucketForKey(file.path) === StorageBucket.PUBLIC
				? this.buildPublicUrl(file.path)
				: await this.objectStorage.createDownloadUrl({
						key: file.path,
						bucket: StorageBucket.PRIVATE,
						expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS
					})

		return plainToInstance(FileDownloadDto, {
			downloadUrl,
			name: file.name,
			size: file.size,
			mimeType: file.mimeType
		})
	}

	getPublicUrl(path: string): string {
		if (resolveBucketForKey(path) !== StorageBucket.PUBLIC) {
			throw new ConflictException('File is not publicly available')
		}

		return this.buildPublicUrl(path)
	}

	deleteFile(fileId: string): Promise<void> {
		return this.files.scheduleDeletion(fileId)
	}

	releaseFile(fileId: string): Promise<void> {
		return this.files.release(fileId)
	}

	private buildPublicUrl(path: string): string {
		return `${this.publicBaseUrl}/${path}`
	}
}

import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { plainToInstance } from 'class-transformer'
import { fileTypeFromBuffer } from 'file-type'
import { InitUploadDto } from './dto/init-upload.dto'
import { FileDto } from './dto/file.dto'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { OBJECT_STORAGE, ObjectStoragePort, StorageBucket } from './ports/object-storage.port'
import { resolveBucketForDirectory, resolveBucketForKey } from './constants/bucket-routing'
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
	/** Что именно загружает пользователь. Без неё действует общий режим FILE. */
	category?: UploadCategory
	/**
	 * Каталог в бакете: вложение чата, аватар пользователя, канала, группы,
	 * стикер. Каталог задаёт и бакет: стикеры лежат в публичном, всё
	 * остальное — в приватном.
	 */
	directory: FileType
	/**
	 * Размеры кадра в пикселях: есть только у фото и видео.
	 *
	 * Хранилище ими не пользуется и не проверяет их по файлу — они просто
	 * доезжают до записи File, чтобы получатель узнал форму вложения до
	 * скачивания.
	 */
	width?: number
	height?: number
}

/**
 * Фасад загрузки и скачивания.
 *
 * Сам ничего не делает: собирает сценарий из правил (UploadPolicyService),
 * учёта файлов (FileRegistryService) и хранилища (ObjectStoragePort).
 */
@Injectable()
export class StorageService {
	/** Домен раздачи публичных файлов без завершающего слэша. */
	private readonly publicBaseUrl: string

	constructor(
		@Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStoragePort,
		private readonly files: FileRegistryService,
		private readonly policy: UploadPolicyService,
		config: ConfigService
	) {
		this.publicBaseUrl = config.get<string>('CDN_PUBLIC_BASE_URL')!.replace(/\/+$/, '')
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

	/**
	 * Подтверждение загрузки.
	 *
	 * Раньше несовпадение типа молча исправлялось перезаписью заголовка, то есть
	 * файл принимался в любом случае. Теперь это отказ: объект удаляется, а
	 * вызывающий получает ошибку и не создаёт ни вложение, ни аватар.
	 */
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
			/*
			 * Объекта нет: форму получили, а файл не отправили либо S3 отклонил его
			 * по политике. Запись оставляем — её через сутки уберёт уборщик.
			 */
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

	/**
	 * Ссылка на скачивание.
	 *
	 * Права здесь не проверяются осознанно: хранилище не знает ни о чатах, ни о
	 * профилях. Вызывать этот метод можно только после проверки доступа —
	 * для аватаров это AvatarAccessService, для вложений MessagesService.
	 *
	 * У публичных файлов возвращается постоянная ссылка, а не подписанная:
	 * подписывать то, что и так открыто по ссылке, смысла нет, а меняющаяся
	 * подпись сбивала бы кэш на клиенте.
	 */
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
			mimeType: file.mime
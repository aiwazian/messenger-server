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
export class StorageService implements OnModuleInit {
	private readonly logger = new Logger(StorageService.name)

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

	/**
	 * Открытие доступа к публичным каталогам на старте.
	 *
	 * Настройка живёт в коде, а не в ручном шаге развёртывания: список публичных
	 * каталогов и права на них берутся из одного источника, поэтому новый
	 * публичный каталог нельзя добавить и забыть открыть.
	 *
	 * Операция идемпотентная: политика заменяется целиком одним и тем же
	 * документом, так что перезапуски ничего не накапливают.
	 *
	 * Ошибка не роняет сервер: без политики перестают открываться только
	 * стикеры, а переписка, звонки и аватары работают через подписанные
	 * ссылки и от неё не зависят. Причина пишется в лог целиком: чаще всего
	 * это отсутствие права s3:PutBucketPolicy у ключа доступа.
	 */
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
			mimeType: file.mimeType
		})
	}

	/**
	 * Постоянная ссылка на публичный файл по его пути в бакете.
	 *
	 * Без запроса к хранилищу и без подписи: такую ссылку можно отдавать
	 * сразу сотнями в одном ответе — именно так отдаются наборы стикеров.
	 * У ссылки нет query-параметров и срока жизни, поэтому она годится в качестве
	 * ключа кэша и не заставляет скачивать один и тот же файл заново.
	 *
	 * Домен подставляет сервер, а не собирает клиент: CDN можно сменить,
	 * не выпуская новую версию приложения.
	 */
	getPublicUrl(path: string): string {
		if (resolveBucketForKey(path) !== StorageBucket.PUBLIC) {
			throw new ConflictException('File is not publicly available')
		}

		return this.buildPublicUrl(path)
	}

	/** Безусловное удаление. Вызывающий сам убедился, что ссылок не осталось. */
	deleteFile(fileId: string): Promise<void> {
		return this.files.scheduleDeletion(fileId)
	}

	/** Удаление с проверкой ссылок: файл может использоваться где-то ещё. */
	releaseFile(fileId: string): Promise<void> {
		return this.files.release(fileId)
	}

	private buildPublicUrl(path: string): string {
		return `${this.publicBaseUrl}/${path}`
	}
}

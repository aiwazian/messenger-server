import { BadRequestException, Injectable } from '@nestjs/common'
import { UploadCategory } from '../../../common/enums/upload-category.enum'
import { MAX_UPLOAD_SIZE_BYTES, MIN_UPLOAD_SIZE_BYTES } from '../constants/upload.constants'

/**
 * Обязательный префикс MIME для категории.
 * Для FILE ограничения нет: под неё попадают документы, архивы и всё прочее.
 */
const CATEGORY_MIME_PREFIX: Record<UploadCategory, string | null> = {
	[UploadCategory.IMAGE]: 'image/',
	[UploadCategory.VIDEO]: 'video/',
	[UploadCategory.VOICE]: 'audio/',
	[UploadCategory.FILE]: null
}

/**
 * Типы, у которых содержимое обязано опознаваться по сигнатуре.
 * У документов и текста надёжных magic bytes нет, поэтому требовать
 * определения для них нельзя — будут ложные отказы.
 */
const SNIFFABLE_PREFIXES = ['image/', 'video/', 'audio/']

/**
 * Правила допустимости загрузки.
 *
 * Вынесены отдельно от хранилища и от записей в базе: это единственное место,
 * где меняются лимит размера и соответствие типа категории.
 */
@Injectable()
export class UploadPolicyService {
	readonly minSizeBytes = MIN_UPLOAD_SIZE_BYTES
	readonly maxSizeBytes = MAX_UPLOAD_SIZE_BYTES

	assertSizeAllowed(size: number): void {
		if (!Number.isInteger(size) || size < this.minSizeBytes) {
			throw new BadRequestException('File size must be a positive integer')
		}

		if (size > this.maxSizeBytes) {
			throw new BadRequestException(`File size must not exceed ${this.maxSizeBytes} bytes`)
		}
	}

	/**
	 * Заявленный тип должен соответствовать заявленной категории.
	 *
	 * Проверка до выдачи формы: если категория image, а тип
	 * application/x-msdownload, подписывать политику незачем.
	 */
	assertDeclaredMimeAllowed(category: UploadCategory, mimeType: string): void {
		const prefix = CATEGORY_MIME_PREFIX[category]
		if (!prefix) return

		if (!mimeType.startsWith(prefix)) {
			throw new BadRequestException(`Category ${category} requires a ${prefix}* content type`)
		}
	}

	/**
	 * Сверка реального содержимого с заявленным типом после загрузки.
	 *
	 * S3 проверяет только заголовок Content-Type, содержимое ему недоступно.
	 * Поэтому второй рубеж: если заявлен image/png, а внутри исполняемый файл,
	 * сигнатура не совпадёт с image/ и загрузка не будет подтверждена.
	 */
	assertContentMatchesDeclared(declaredMime: string, detectedMime?: string): void {
		const prefix = SNIFFABLE_PREFIXES.find((candidate) => declaredMime.startsWith(candidate))
		if (!prefix) return

		if (!detectedMime) {
			throw new BadRequestException(
				`Declared ${declaredMime}, but the file content type could not be recognized`
			)
		}

		if (!detectedMime.startsWith(prefix)) {
			throw new BadRequestException(
				`Declared ${declaredMime}, but the file content is ${detectedMime}`
			)
		}
	}

	/** В базе храним распознанный тип: он точнее того, что прислал клиент. */
	resolveStoredMime(declaredMime: string, detectedMime?: string): string {
		return detectedMime ?? declaredMime
	}
}

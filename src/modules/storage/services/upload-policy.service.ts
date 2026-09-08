import { BadRequestException, Injectable } from '@nestjs/common'
import { UploadCategory } from '../../../common/enums/upload-category.enum'
import {
	MAX_AVATAR_SIZE_BYTES,
	MAX_STICKER_SIZE_BYTES,
	MAX_UPLOAD_SIZE_BYTES,
	MIN_UPLOAD_SIZE_BYTES,
	STICKER_MIME_TYPE
} from '../constants/upload.constants'

const CATEGORY_MIME_PREFIX: Record<UploadCategory, string | null> = {
	[UploadCategory.IMAGE]: 'image/',
	[UploadCategory.VIDEO]: 'video/',
	[UploadCategory.VOICE]: 'audio/',
	[UploadCategory.FILE]: null,
	[UploadCategory.STICKER]: 'image/',
	[UploadCategory.AVATAR]: 'image/'
}

const CATEGORY_EXACT_MIME: Partial<Record<UploadCategory, string[]>> = {
	[UploadCategory.STICKER]: [STICKER_MIME_TYPE]
}

const CATEGORY_MAX_SIZE_BYTES: Partial<Record<UploadCategory, number>> = {
	[UploadCategory.STICKER]: MAX_STICKER_SIZE_BYTES,
	[UploadCategory.AVATAR]: MAX_AVATAR_SIZE_BYTES
}

const SNIFFABLE_PREFIXES = ['image/', 'video/', 'audio/']

@Injectable()
export class UploadPolicyService {
	readonly minSizeBytes = MIN_UPLOAD_SIZE_BYTES
	readonly maxSizeBytes = MAX_UPLOAD_SIZE_BYTES

	maxSizeBytesFor(category: UploadCategory): number {
		return CATEGORY_MAX_SIZE_BYTES[category] ?? this.maxSizeBytes
	}

	assertSizeAllowed(size: number, category: UploadCategory = UploadCategory.FILE): void {
		const maxSizeBytes = this.maxSizeBytesFor(category)

		if (!Number.isInteger(size) || size < this.minSizeBytes) {
			throw new BadRequestException('File size must be a positive integer')
		}

		if (size > maxSizeBytes) {
			throw new BadRequestException(`File size must not exceed ${maxSizeBytes} bytes`)
		}
	}

	assertDeclaredMimeAllowed(category: UploadCategory, mimeType: string): void {
		const allowed = CATEGORY_EXACT_MIME[category]

		if (allowed) {
			if (!allowed.includes(mimeType)) {
				throw new BadRequestException(
					`Category ${category} requires one of: ${allowed.join(', ')}`
				)
			}

			return
		}

		const prefix = CATEGORY_MIME_PREFIX[category]
		if (!prefix) return

		if (!mimeType.startsWith(prefix)) {
			throw new BadRequestException(`Category ${category} requires a ${prefix}* content type`)
		}
	}

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

	resolveStoredMime(declaredMime: string, detectedMime?: string): string {
		return detectedMime ?? declaredMime
	}
}

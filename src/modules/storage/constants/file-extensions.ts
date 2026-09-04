/**
 * Расширения для ключей объектов.
 *
 * Самому хранилищу расширение не нужно: тип объекта берётся из Content-Type,
 * записанного при загрузке. Но публичные файлы раздаёт CDN, а он путь без
 * расширения считает каталогом и отвечает 403, даже не обращаясь к бакету.
 * Поэтому ключ всегда заканчивается расширением.
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
	'image/webp': 'webp',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'audio/aac': 'aac',
	'audio/ogg': 'ogg',
	'audio/opus': 'opus',
	'audio/wav': 'wav',
	'application/pdf': 'pdf',
	'application/zip': 'zip'
}

/** Расширение, когда тип не опознан: ключ всё равно не должен выглядеть каталогом. */
const FALLBACK_EXTENSION = 'bin'

/** Расширения длиннее этого в именах файлов не встречаются и выглядят как мусор. */
const MAX_NAME_EXTENSION_LENGTH = 8

/**
 * Расширение для ключа в бакете.
 *
 * Заявленный тип надёжнее имени файла, поэтому сначала ищем по нему. Имя
 * нужно для документов и архивов: их типов слишком много, чтобы держать
 * полный список, зато расширение у них почти всегда на месте.
 *
 * Возвращается вместе с точкой, чтобы вызывающий код просто дописывал
 * результат к идентификатору.
 */
export function resolveFileExtension(mimeType: string, fileName?: string): string {
	const normalizedMime = mimeType.trim().toLowerCase().split(';')[0]
	const byMime = EXTENSION_BY_MIME_TYPE[normalizedMime]
	if (byMime) return `.${byMime}`

	return `.${extractExtensionFromName(fileName) ?? FALLBACK_EXTENSION}`
}

/**
 * Расширение из имени файла.
 *
 * Имя приходит от клиента и в ключ попадает как есть, поэтому пропускаем
 * только буквы и цифры: точки, слэши и прочее сломали бы путь в бакете.
 */
function extractExtensionFromName(fileName?: string): string | undefined {
	if (!fileName) return undefined

	const dotIndex = fileName.lastIndexOf('.')
	if (dotIndex < 0) return undefined

	const candidate = fileName.slice(dotIndex + 1).toLowerCase()
	if (!candidate || candidate.length > MAX_NAME_EXTENSION_LENGTH) return undefined
	if (!/^[a-z0-9]+$/.test(candidate)) return undefined

	return candidate
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/bmp': 'bmp',
	'image/tiff': 'tiff',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
	'video/x-matroska': 'mkv',
	'video/x-msvideo': 'avi',
	'video/x-ms-wmv': 'wmv',
	'video/mpeg': 'mpeg',
	'video/3gpp': '3gp',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'audio/x-m4a': 'm4a',
	'audio/aac': 'aac',
	'audio/ogg': 'ogg',
	'audio/opus': 'opus',
	'audio/webm': 'weba',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/flac': 'flac',
	'audio/amr': 'amr',
	'audio/3gpp': '3gp',
	'application/pdf': 'pdf',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'application/vnd.oasis.opendocument.text': 'odt',
	'application/vnd.oasis.opendocument.spreadsheet': 'ods',
	'application/vnd.oasis.opendocument.presentation': 'odp',
	'application/rtf': 'rtf',
	'application/json': 'json',
	'application/xml': 'xml',
	'application/epub+zip': 'epub',
	'application/zip': 'zip',
	'application/vnd.rar': 'rar',
	'application/x-rar-compressed': 'rar',
	'application/x-7z-compressed': '7z',
	'application/x-tar': 'tar',
	'application/gzip': 'gz',
	'application/x-bzip2': 'bz2',
	'application/vnd.android.package-archive': 'apk',
	'text/plain': 'txt',
	'text/csv': 'csv',
	'text/html': 'html',
	'text/markdown': 'md',
	'text/xml': 'xml'
}

const FALLBACK_EXTENSION = 'bin'

const MAX_NAME_EXTENSION_LENGTH = 8

export function resolveFileExtension(mimeType: string, fileName?: string): string {
	const normalizedMime = mimeType.trim().toLowerCase().split(';')[0].trim()
	const byMime = EXTENSION_BY_MIME_TYPE[normalizedMime]
	if (byMime) return `.${byMime}`

	return `.${extractExtensionFromName(fileName) ?? FALLBACK_EXTENSION}`
}

function extractExtensionFromName(fileName?: string): string | undefined {
	if (!fileName) return undefined

	const dotIndex = fileName.lastIndexOf('.')
	if (dotIndex < 0) return undefined

	const candidate = fileName.slice(dotIndex + 1).toLowerCase()
	if (!candidate || candidate.length > MAX_NAME_EXTENSION_LENGTH) return undefined
	if (!/^[a-z0-9]+$/.test(candidate)) return undefined

	return candidate
}

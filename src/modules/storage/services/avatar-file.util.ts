import { BadRequestException } from '@nestjs/common'
import { FileType } from '../../../common/enums/file-type.enum'

const AVATAR_MIME_PREFIXES = ['image/', 'video/']

export function assertUsableAsAvatar(
	file: { path: string; mimeType: string },
	directory: FileType
): void {
	if (!file.path.startsWith(`${directory}/`)) {
		throw new BadRequestException('File does not belong to the avatar storage')
	}

	if (!AVATAR_MIME_PREFIXES.some((prefix) => file.mimeType.startsWith(prefix))) {
		throw new BadRequestException('Avatar must be an image or a video')
	}
}

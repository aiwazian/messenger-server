import { FileType } from '../../../common/enums/file-type.enum'
import { StorageBucket } from '../ports/object-storage.port'

export const PUBLIC_DIRECTORIES: FileType[] = [FileType.STICKER, FileType.EMOJI]

export function resolveBucketForDirectory(directory: FileType): StorageBucket {
	return PUBLIC_DIRECTORIES.includes(directory) ? StorageBucket.PUBLIC : StorageBucket.PRIVATE
}

export function resolveBucketForKey(key: string): StorageBucket {
	const isPublic = PUBLIC_DIRECTORIES.some(
		(directory) => key === directory || key.startsWith(`${directory}/`)
	)

	return isPublic ? StorageBucket.PUBLIC : StorageBucket.PRIVATE
}

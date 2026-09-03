import { FileType } from '../../../common/enums/file-type.enum'
import { StorageBucket } from '../ports/object-storage.port'

/**
 * Каталоги, лежащие в публичном бакете.
 *
 * Публичность у провайдера — свойство бакета целиком, а не отдельного
 * объекта, поэтому «сделать публичным один файл» невозможно: приватное и
 * публичное разнесено по разным бакетам.
 */
const PUBLIC_DIRECTORIES: FileType[] = [FileType.STICKER]

/** Бакет для нового файла — по каталогу, в который его кладут. */
export function resolveBucketForDirectory(directory: FileType): StorageBucket {
	return PUBLIC_DIRECTORIES.includes(directory) ? StorageBucket.PUBLIC : StorageBucket.PRIVATE
}

/**
 * Бакет уже существующего объекта — по его ключу.
 *
 * Ключ всегда начинается с каталога (FileType), поэтому бакет выводится из
 * пути и не требует отдельной колонки в File: уборщику и удалению достаточно
 * того пути, который у них уже есть, а записи, созданные до появления
 * стикеров, продолжают указывать на приватный бакет.
 */
export function resolveBucketForKey(key: string): StorageBucket {
	const isPublic = PUBLIC_DIRECTORIES.some(
		(directory) => key === directory || key.startsWith(`${directory}/`)
	)

	return isPublic ? StorageBucket.PUBLIC : StorageBucket.PRIVATE
}

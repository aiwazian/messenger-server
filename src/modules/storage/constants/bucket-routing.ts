import { FileType } from '../../../common/enums/file-type.enum'
import { StorageBucket } from '../ports/object-storage.port'

/**
 * Каталоги, доступные по постоянной ссылке, без подписи.
 *
 * Роль бакета говорит о способе раздачи, а не о месте хранения: открытый
 * доступ на чтение можно дать как отдельным бакетом, так и политикой на
 * префикс внутри общего бакета. Важно только одно: что лежит здесь, то
 * отдаётся всем и кэшируется, а всё остальное — по подписанной ссылке.
 *
 * Из этого же списка строится политика бакета на старте сервера, поэтому
 * настройки доступа и маршрутизация не могут рассогласоваться.
 */
export const PUBLIC_DIRECTORIES: FileType[] = [FileType.STICKER]

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

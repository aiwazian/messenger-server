export enum FileType {
	CHAT_ATTACHMENT = 'chats',
	USER_AVATAR = 'avatars/users',
	CHANNEL_AVATAR = 'avatars/channels',
	GROUP_AVATAR = 'avatars/groups',

	/**
	 * Каталог стикеров.
	 *
	 * От остальных отличается не только именем: каталог решает, в какой
	 * бакет попадёт файл, а стикеры — единственное, что раздаётся публично.
	 * Соответствие каталога бакету задано в storage/constants/bucket-routing.ts.
	 */
	STICKER = 'stickers'
}

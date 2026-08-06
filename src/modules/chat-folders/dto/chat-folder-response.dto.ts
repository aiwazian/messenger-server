import { Exclude, Expose, Type } from 'class-transformer'
import { ChatFolderCategory } from '../../../generated/prisma/enums'

@Exclude()
export class ChatFolderChatResponseDto {
	@Expose()
	chatId: string

	/// Закрепление внутри папки: в разных папках у одного чата оно своё.
	@Expose()
	isPinned: boolean

	@Expose()
	sortOrder: number
}

@Exclude()
export class ChatFolderResponseDto {
	@Expose()
	id: number

	@Expose()
	name: string

	/// Позиция вкладки на главном экране.
	@Expose()
	sortOrder: number

	/// Категории, включённые в папку целиком: клиент раскрывает их по типу чата.
	@Expose()
	categories: ChatFolderCategory[]

	/// Чаты, добавленные в папку поимённо.
	@Expose()
	@Type(() => ChatFolderChatResponseDto)
	chats: ChatFolderChatResponseDto[]
}

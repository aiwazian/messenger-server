import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ChatMediaService } from './chat-media.service'
import { ChatMediaQueryDto } from './dto/chat-media-query.dto'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { ParseChatIdPipe } from '../../common/pipes/parse-chat-id.pipe'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { ChatId } from '../../common/types/chat-id.type'
import { UserId } from '../../common/types/user-id.type'

/**
 * Вложения чата двумя отдельными списками.
 *
 * Разделение по адресу, а не параметром запроса: у вкладок «Медиа» и «Файлы»
 * свои курсоры и свой размер страницы, и общий endpoint пришлось бы разбирать
 * на клиенте по типу вложения.
 *
 * Гард на весь контроллер: доступ к чату проверяется до любого чтения, поэтому
 * добавленный сюда endpoint не может оказаться открытым по забывчивости.
 * Свой Throttle строже глобального: галерея тянется постранично и легко
 * превращается в перебор истории.
 */
@Controller('chats/:chatId')
@UseGuards(CanReadChatGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class ChatMediaController {
	constructor(private readonly chatMediaService: ChatMediaService) {}

	/** Фото и видео чата, от новых к старым. */
	@Get('media')
	getMedia(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query() dto: ChatMediaQueryDto
	) {
		return this.chatMediaService.getMedia(userId, chatId, dto)
	}

	/** Документы чата, от новых к старым. */
	@Get('files')
	getFiles(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query() dto: ChatMediaQueryDto
	) {
		return this.chatMediaService.getFiles(userId, chatId, dto)
	}
}

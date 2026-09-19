import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ChatMediaService } from './chat-media.service'
import { ChatMediaQueryDto } from './dto/chat-media-query.dto'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { ParseChatIdPipe } from '../../common/pipes/parse-chat-id.pipe'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { ChatId } from '../../common/types/chat-id.type'
import { UserId } from '../../common/types/user-id.type'

@Controller('chats/:chatId')
@UseGuards(CanReadChatGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class ChatMediaController {
	constructor(private readonly chatMediaService: ChatMediaService) {}

	@Get('media')
	getMedia(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query() dto: ChatMediaQueryDto
	) {
		return this.chatMediaService.getMedia(userId, chatId, dto)
	}

	@Get('files')
	getFiles(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query() dto: ChatMediaQueryDto
	) {
		return this.chatMediaService.getFiles(userId, chatId, dto)
	}

	@Get('music')
	getMusic(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query() dto: ChatMediaQueryDto
	) {
		return this.chatMediaService.getMusic(userId, chatId, dto)
	}

	@Get('voices')
	getVoices(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query() dto: ChatMediaQueryDto
	) {
		return this.chatMediaService.getVoices(userId, chatId, dto)
	}

	@Get('media-counts')
	getCounts(@Param('chatId', ParseChatIdPipe) chatId: ChatId, @CurrentUserId() userId: UserId) {
		return this.chatMediaService.getCounts(userId, chatId)
	}
}

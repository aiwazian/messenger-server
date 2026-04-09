import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	UseGuards,
	ParseIntPipe,
	Query,
	Delete
} from '@nestjs/common'
import { MessagesService } from './messages.service'
import { TextMessageDto } from './dto/text-message.dto'
import { MediaMessageDto } from './dto/media-message.dto'
import { FileInitDto } from './dto/file-init.dto'
import { FileConfirmDto } from './dto/file-confirm.dto'
import { AuthGuard } from '../../common/guards/auth.guard'
import { CanSendMessageGuard } from '../../common/guards/can-send-message.guard'
import { ParseChatIdPipe } from '../../common/pipes/parse-chat-id.pipe'
import { ChatId } from '../../common/types/chat-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { CanDeleteMessageGuard } from '../../common/guards/can-delete-message.guard'

@Controller('chats/:chatId/messages')
@UseGuards(AuthGuard)
export class MessagesController {
	constructor(private readonly messagesService: MessagesService) { }

	@Post()
	@UseGuards(CanSendMessageGuard)
	sendMessage(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Body() dto: TextMessageDto,
		@CurrentUserId() userId: UserId
	) {
		return this.messagesService.sendTextMessage(userId, chatId, dto)
	}

	@Post('media')
	@UseGuards(CanSendMessageGuard)
	sendMediaMessage(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Body() dto: MediaMessageDto,
		@CurrentUserId() userId: UserId
	) {
		return this.messagesService.sendMediaMessage(userId, chatId, dto)
	}

	@Post('files/init')
	@UseGuards(CanSendMessageGuard)
	initFileUpload(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Body() dto: FileInitDto,
		@CurrentUserId() userId: UserId
	) {
		return this.messagesService.initFileUpload(userId, chatId, dto)
	}

	@Post('files/confirm')
	@UseGuards(CanSendMessageGuard)
	confirmFileUpload(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Body() dto: FileConfirmDto,
		@CurrentUserId() userId: UserId
	) {
		return this.messagesService.confirmFileUpload(userId, chatId, dto)
	}

	@Get(':messageId/files/:fileId/download')
	@UseGuards(CanReadChatGuard)
	getFileDownloadUrl(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Param('messageId', ParseIntPipe) messageId: number,
		@Param('fileId') fileId: string,
		@CurrentUserId() userId: UserId
	) {
		return this.messagesService.getFileDownloadUrl(userId, chatId, messageId, fileId)
	}

	@Get()
	@UseGuards(CanReadChatGuard)
	getMessages(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
		@Query('offset', new ParseIntPipe({ optional: true })) offset?: number
	) {
		return this.messagesService.getAll(userId, chatId, limit, offset)
	}

	@Post(':messageId/read')
	@UseGuards(CanReadChatGuard)
	markRead(@Param('messageId', ParseIntPipe) messageId: number, @CurrentUserId() userId: UserId) {
		return this.messagesService.markRead(userId, messageId)
	}

	@Post('read')
	@UseGuards(CanReadChatGuard)
	markAllRead(@Param('chatId', ParseChatIdPipe) chatId: ChatId, @CurrentUserId() userId: UserId) {
		return this.messagesService.markAllRead(userId, chatId)
	}

	@Delete(':messageId')
	@UseGuards(CanDeleteMessageGuard)
	deleteMessage(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Param('messageId', ParseIntPipe) messageId: number,
		@CurrentUserId() userId: UserId,
		@Query('forEveryone') forEveryone?: string
	) {
		return this.messagesService.deleteMessage(userId, chatId, messageId, forEveryone === 'true')
	}

	@Delete()
	@UseGuards(CanReadChatGuard)
	clearHistory(@Param('chatId', ParseChatIdPipe) chatId: ChatId, @CurrentUserId() userId: UserId) {
		return this.messagesService.clearHistory(userId, chatId)
	}

	@Post('voice')
	sendVoiceMessage() { }

	@Post('reaction')
	sendReaction() { }
}

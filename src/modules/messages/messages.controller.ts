import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	Patch,
	UseGuards,
	ParseIntPipe,
	Query,
	Delete,
	Headers
} from '@nestjs/common'
import { MessagesService } from './messages.service'
import { TextMessageDto } from './dto/text-message.dto'
import { DeleteMessageDto } from './dto/delete-message.dto'
import { ClearHistoryDto } from './dto/clear-history.dto'
import { FileInitDto } from './dto/file-init.dto'
import { FileConfirmDto } from './dto/file-confirm.dto'
import { CanSendMessageGuard } from '../../common/guards/can-send-message.guard'
import { ParseChatIdPipe } from '../../common/pipes/parse-chat-id.pipe'
import { ChatId } from '../../common/types/chat-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { CanDeleteMessageGuard } from '../../common/guards/can-delete-message.guard'
import { CanEditMessageGuard } from '../../common/guards/can-edit-message.guard'
import { CanClearHistoryGuard } from '../../common/guards/can-clear-history.guard'
import { EditMessageDto } from './dto/edit-message.dto'
import { SendMessageUseCase } from './use-cases/send-message.use-case'
import { GetMessagesWindowUseCase } from './use-cases/get-messages-window.use-case'
import { SearchChatMessagesUseCase } from './use-cases/search-chat-messages.use-case'
import { GetMessagesWindowDto } from './dto/get-messages-window.dto'
import { SearchMessagesDto } from './dto/search-messages.dto'
import { ForwardMessageUseCase } from './use-cases/forward-message.use-case'
import { ForwardMessageDto } from './dto/forward-message.dto'
import { ChatReadStateService } from '../chat-read-state/chat-read-state.service'
import { MarkReadDto } from '../chat-read-state/dto/mark-read.dto'

@Controller('chats/:chatId/messages')
export class MessagesController {
	constructor(
		private readonly messagesService: MessagesService,
		private readonly sendMessageUseCase: SendMessageUseCase,
		private readonly getMessagesWindowUseCase: GetMessagesWindowUseCase,
		private readonly searchChatMessagesUseCase: SearchChatMessagesUseCase,
		private readonly forwardMessageUseCase: ForwardMessageUseCase,
		private readonly chatReadStateService: ChatReadStateService
	) {}

	@Post()
	@UseGuards(CanSendMessageGuard)
	sendMessage(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Body() dto: TextMessageDto,
		@CurrentUserId() userId: UserId,
		@Headers('x-socket-id') socketId: string
	) {
		return this.sendMessageUseCase.execute(userId, chatId, dto, socketId)
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
		@CurrentUserId() userId: UserId,
		@Headers('x-socket-id') socketId: string
	) {
		return this.messagesService.confirmFileUpload(userId, chatId, dto, socketId)
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

	/**
	 * Окно истории для прыжков по сообщениям.
	 *
	 * GET .../messages/window?limit=50                  — последние сообщения (открытие чата, FAB вниз)
	 * GET .../messages/window?anchorId=283&limit=25      — окно вокруг сообщения (reply, закреп, поиск)
	 * GET .../messages/window?beforeId=250&limit=50      — страница старше (скролл вверх)
	 * GET .../messages/window?afterId=300&limit=50       — страница новее (скролл вниз)
	 */
	@Get('window')
	@UseGuards(CanReadChatGuard)
	getMessagesWindow(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query() dto: GetMessagesWindowDto
	) {
		return this.getMessagesWindowUseCase.execute(userId, chatId, dto)
	}

	/** Поиск по сообщениям внутри чата. Клиент берёт id из результата и дергает /window?anchorId=. */
	@Get('search')
	@UseGuards(CanReadChatGuard)
	searchMessages(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Query() dto: SearchMessagesDto
	) {
		return this.searchChatMessagesUseCase.execute(userId, chatId, dto)
	}

	/**
	 * Пересылка сообщения в один или несколько чатов.
	 *
	 * Гард проверяет доступ к чату-источнику, права на запись в каждый чат-получатель
	 * проверяются внутри use-case.
	 */
	@Post(':messageId/forward')
	@UseGuards(CanReadChatGuard)
	forwardMessage(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Param('messageId', ParseIntPipe) messageId: number,
		@Body() dto: ForwardMessageDto,
		@CurrentUserId() userId: UserId,
		@Headers('x-socket-id') socketId: string
	) {
		return this.forwardMessageUseCase.execute(userId, chatId, messageId, dto, socketId)
	}

	/**
	 * Прочитано всё до :messageId включительно.
	 *
	 * Клиент присылает максимальный id из тех, что реально показались на экране
	 * больше чем наполовину. Возвращает актуальный счётчик непрочитанных.
	 */
	@Post(':messageId/read')
	@UseGuards(CanReadChatGuard)
	markRead(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Param('messageId', ParseIntPipe) messageId: number,
		@CurrentUserId() userId: UserId
	) {
		return this.chatReadStateService.markReadUpTo(userId, chatId, BigInt(messageId))
	}

	/** Прочитан весь чат либо всё до upToMessageId: кнопка «вниз» в конец истории. */
	@Post('read')
	@UseGuards(CanReadChatGuard)
	markAllRead(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Body() dto: MarkReadDto
	) {
		return this.chatReadStateService.markReadUpTo(
			userId,
			chatId,
			dto.upToMessageId ? BigInt(dto.upToMessageId) : undefined
		)
	}

	@Delete(':messageId')
	@UseGuards(CanDeleteMessageGuard)
	deleteMessage(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Param('messageId', ParseIntPipe) messageId: number,
		@CurrentUserId() userId: UserId,
		@Body() dto: DeleteMessageDto
	) {
		return this.messagesService.deleteMessage(userId, chatId, messageId, dto)
	}

	@Patch(':messageId')
	@UseGuards(CanEditMessageGuard)
	editMessage(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Param('messageId', ParseIntPipe) messageId: number,
		@CurrentUserId() userId: UserId,
		@Body() dto: EditMessageDto,
		@Headers('x-socket-id') socketId: string
	) {
		return this.messagesService.editMessage(userId, chatId, messageId, dto, socketId)
	}

	@Delete()
	@UseGuards(CanClearHistoryGuard)
	clearHistory(
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@CurrentUserId() userId: UserId,
		@Body() dto: ClearHistoryDto
	) {
		return this.messagesService.clearHistory(userId, chatId, dto.clearForRecipient)
	}

	@Post('voice')
	sendVoiceMessage() {}

	@Post('reaction')
	sendReaction() {}
}

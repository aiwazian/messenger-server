import {
	Controller,
	Get,
	Param,
	UseGuards,
	Delete,
	HttpCode,
	HttpStatus,
	ParseIntPipe,
	Post,
	Body,
	Headers
} from '@nestjs/common'
import { ChatsService } from './chats.service'
import { InviteLinksService } from '../invites/invite-links.service'
import { UserId } from '../../common/types/user-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { ChatId } from '../../common/types/chat-id.type'
import { InviteLinkOwnerGuard } from '../../common/guards/invite-link-owner.guard'
import { DeleteChatDto } from './dto/delete-chat.dto'
import { DeleteChatUseCase } from './use-cases/delete-chat.use-case'
import { ChatReadStateService } from '../chat-read-state/chat-read-state.service'
import { MarkChatsDto } from '../chat-read-state/dto/mark-chats.dto'

@Controller('chats')
export class ChatsController {
	constructor(
		private readonly chatsService: ChatsService,
		private readonly inviteLinksService: InviteLinksService,
		private readonly deleteChatUseCase: DeleteChatUseCase,
		private readonly chatReadStateService: ChatReadStateService
	) {}

	@Get()
	getAll(@CurrentUserId() userId: UserId) {
		return this.chatsService.getAll(userId)
	}

	@Get('online')
	getOnlineUsers(@CurrentUserId() userId: UserId) {
		return this.chatsService.getOnlineUserIds(userId)
	}

	@Get(':chatId')
	@UseGuards(CanReadChatGuard)
	getById(@CurrentUserId() userId: UserId, @Param('chatId') chatId: string) {
		return this.chatsService.getById(userId, ChatId(chatId))
	}

	@Delete(':chatId')
	@UseGuards(CanReadChatGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteChat(
		@CurrentUserId() userId: UserId,
		@Param('chatId') chatId: string,
		@Body() dto: DeleteChatDto
	) {
		return this.deleteChatUseCase.execute(userId, ChatId(chatId), dto.deleteForRecipient)
	}

	@Get('invite-links/:code/info')
	getInviteLinkInfo(@CurrentUserId() userId: UserId, @Param('code') code: string) {
		return this.inviteLinksService.getInfo(userId, code)
	}

	@Get('join/:code')
	joinViaLink(@CurrentUserId() userId: UserId, @Param('code') code: string) {
		return this.inviteLinksService.join(userId, code)
	}

	@Delete('invite-links/:inviteLinkId')
	@UseGuards(InviteLinkOwnerGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteInviteLink(@Param('inviteLinkId', ParseIntPipe) inviteLinkId: number) {
		return this.inviteLinksService.delete(inviteLinkId)
	}

	@Post('pin')
	@HttpCode(HttpStatus.NO_CONTENT)
	pinChats(@CurrentUserId() userId: UserId, @Body() body: { chatIds: string[] }) {
		const chatIds = body.chatIds.map((id) => ChatId(id))
		return this.chatsService.pinChats(userId, chatIds)
	}

	@Post('unpin')
	@HttpCode(HttpStatus.NO_CONTENT)
	unpinChats(@CurrentUserId() userId: UserId, @Body() body: { chatIds: string[] }) {
		const chatIds = body.chatIds.map((id) => ChatId(id))
		return this.chatsService.unpinChats(userId, chatIds)
	}

	/**
	 * Прочитать выделенные чаты целиком.
	 *
	 * Клиент присылает только действительно непрочитанные чаты, но повторный
	 * вызов безопасен: курсор в ChatReadState только растёт, а отметки в Redis
	 * пишутся через ZADD NX и не перетирают время первого прочтения.
	 */
	@Post('read')
	@HttpCode(HttpStatus.NO_CONTENT)
	async markChatsRead(
		@CurrentUserId() userId: UserId,
		@Body() dto: MarkChatsDto,
		@Headers('x-socket-id') socketId?: string
	) {
		const chatIds = dto.chatIds.map((id) => ChatId(id))
		await this.chatReadStateService.markChatsRead(userId, chatIds, socketId)
	}

	/** Пометить выделенные чаты непрочитанными. Собеседникам событие не шлётся. */
	@Post('unread')
	@HttpCode(HttpStatus.NO_CONTENT)
	async markChatsUnread(
		@CurrentUserId() userId: UserId,
		@Body() dto: MarkChatsDto,
		@Headers('x-socket-id') socketId?: string
	) {
		const chatIds = dto.chatIds.map((id) => ChatId(id))
		await this.chatReadStateService.markChatsUnread(userId, chatIds, socketId)
	}
}

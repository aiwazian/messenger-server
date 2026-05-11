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
	Body
} from '@nestjs/common'
import { ChatsService } from './chats.service'
import { InviteLinksService } from '../invites/invite-links.service'
import { AuthGuard } from '../../common/guards/auth.guard'
import { UserId } from '../../common/types/user-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { ChatId } from '../../common/types/chat-id.type'
import { InviteLinkOwnerGuard } from '../../common/guards/invite-link-owner.guard'
import { DeleteChatDto } from './dto/delete-chat.dto'
import { DeleteChatUseCase } from './use-cases/delete-chat.use-case'

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatsController {
	constructor(
		private readonly chatsService: ChatsService,
		private readonly inviteLinksService: InviteLinksService,
		private readonly deleteChatUseCase: DeleteChatUseCase
	) { }

	@Get()
	getAll(@CurrentUserId() userId: UserId) {
		return this.chatsService.getAll(userId)
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
}

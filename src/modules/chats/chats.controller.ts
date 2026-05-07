import {
	Controller,
	Get,
	Param,
	UseGuards,
	Delete,
	HttpCode,
	HttpStatus,
	ParseIntPipe
} from '@nestjs/common'
import { ChatsService } from './chats.service'
import { InviteLinksService } from '../invites/invite-links.service'
import { AuthGuard } from '../../common/guards/auth.guard'
import { UserId } from '../../common/types/user-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { ChatId } from '../../common/types/chat-id.type'
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe'
import { InviteLinkOwnerGuard } from '../../common/guards/invite-link-owner.guard'

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatsController {
	constructor(
		private readonly chatsService: ChatsService,
		private readonly inviteLinksService: InviteLinksService
	) {}

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
	deleteChat(@CurrentUserId() userId: UserId, @Param('chatId') chatId: string) {
		return this.chatsService.deleteChat(userId, ChatId(chatId))
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
}

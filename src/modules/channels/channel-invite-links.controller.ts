import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Post,
	UseGuards,
} from '@nestjs/common'
import { InviteLinksService } from '../invites/invite-links.service'
import { CreateInviteLinkDto } from '../chats/dto/create-invite-link.dto'
import { AuthGuard } from '../../common/guards/auth.guard'
import { ChannelOwnerGuard } from '../../common/guards/channel-owner.guard'
import { ChannelExistsGuard } from '../../common/guards/channel-exists.guard'
import { PARAMS } from '../../common/constants/param.constants'
import { ParseChannelIdPipe } from '../../common/pipes/parse-channel-id.pipe'
import { ChannelId } from '../../common/types/channel-id.type'
import { UserId } from '../../common/types/user-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { ChatId } from '../../common/types/chat-id.type'

@Controller('channels')
@UseGuards(AuthGuard)
export class ChannelInviteLinksController {
	constructor(
		private readonly inviteLinksService: InviteLinksService
	) { }

	@Get(`:${PARAMS.CHANNEL_ID}/invite-links`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	getInviteLinks(@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId) {
		return this.inviteLinksService.getByChatId(ChatId(id))
	}

	@Post(`:${PARAMS.CHANNEL_ID}/invite-links`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	createInviteLink(
		@CurrentUserId() userId: UserId,
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) channelId: ChannelId,
		@Body() dto: CreateInviteLinkDto
	) {
		return this.inviteLinksService.create(userId, ChatId(channelId), dto)
	}

	@Delete(`:${PARAMS.CHANNEL_ID}/invite-links/:inviteLinkId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	deleteInviteLink(@Param('inviteLinkId', ParseIntPipe) inviteLinkId: number) {
		return this.inviteLinksService.delete(inviteLinkId)
	}
}

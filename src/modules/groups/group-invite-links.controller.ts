import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Post,
	UseGuards
} from '@nestjs/common'
import { InviteLinksService } from '../invites/invite-links.service'
import { CreateInviteLinkDto } from '../chats/dto/create-invite-link.dto'
import { AuthGuard } from '../../common/guards/auth.guard'
import { GroupExistsGuard } from '../../common/guards/group-exists.guard'
import { PARAMS } from '../../common/constants/param.constants'
import { GroupOwnerGuard } from '../../common/guards/group-owner.guard'
import { ParseGroupIdPipe } from '../../common/pipes/parse-group-id.pipe'
import { GroupId } from '../../common/types/group-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupInviteLinksController {
	constructor(
		private readonly inviteLinksService: InviteLinksService
	) { }

	@Get(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	getInviteLinks(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId) {
		return this.inviteLinksService.getByChatId(ChatId(id))
	}

	@Post(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	createInviteLink(
		@CurrentUserId() userId: UserId,
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) groupId: GroupId,
		@Body() dto: CreateInviteLinkDto
	) {
		return this.inviteLinksService.create(userId, ChatId(groupId), dto)
	}

	@Delete(`:${PARAMS.GROUP_ID}/invite-links/:inviteLinkId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	deleteInviteLink(@Param('inviteLinkId', ParseIntPipe) inviteLinkId: number) {
		return this.inviteLinksService.delete(inviteLinkId)
	}
}

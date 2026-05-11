import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Patch,
	Post,
	Query,
	UseGuards
} from '@nestjs/common'
import { GroupsService } from './groups.service'
import { CreateGroupDto } from './dto/create-group.dto'
import { UpdateGroupDto } from './dto/update-group.dto'
import { AddMembersDto } from './dto/add-members.dto'
import { AuthGuard } from '../../common/guards/auth.guard'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { PARAMS } from '../../common/constants/param.constants'
import { GroupExistsGuard } from '../../common/guards/group-exists.guard'
import { ParseGroupIdPipe } from '../../common/pipes/parse-group-id.pipe'
import { GroupId } from '../../common/types/group-id.type'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { GroupOwnerGuard } from '../../common/guards/group-owner.guard'
import { ParseUserIdPipe } from '../../common/pipes/parse-user-id.pipe'
import { ParseIntPipe } from '@nestjs/common'
import { CreateInviteLinkDto } from '../../common/dtos/create-invite-link.dto'
import { UpdateInviteLinkDto } from '../../common/dtos/update-invite-link.dto'
import { CreateGroupUseCase } from './use-cases/create-group.use-case'

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
	constructor(private readonly groupsService: GroupsService,
		private readonly createGroupUseCase: CreateGroupUseCase
	) { }

	@Post()
	createGroup(@CurrentUserId() userId: UserId, @Body() dto: CreateGroupDto) {
		return this.createGroupUseCase.execute(userId, dto)
	}

	@Get(`:${PARAMS.GROUP_ID}`)
	@UseGuards(GroupExistsGuard)
	getById(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId, @CurrentUserId() userId: UserId) {
		return this.groupsService.getById(id, userId)
	}

	@Get(`:${PARAMS.GROUP_ID}/members`)
	@UseGuards(GroupExistsGuard, CanReadChatGuard)
	getMembers(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Query('skip') skip: number,
		@Query('take') take: number,
		@Query('search') search?: string
	) {
		return this.groupsService.getMembers(id, Number(skip) || 0, Number(take) || 100, search)
	}

	@Get(`:${PARAMS.GROUP_ID}/available-users`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	getAvailableUsersForInvite(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@CurrentUserId() userId: UserId
	) {
		return this.groupsService.getAvailableUsersForInvite(id, userId)
	}

	@Post(`:${PARAMS.GROUP_ID}/add-members`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	addMembers(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Body() dto: AddMembersDto,
		@CurrentUserId() ownerId: UserId
	) {
		return this.groupsService.addMembers(id, dto, ownerId)
	}

	@Patch(`:${PARAMS.GROUP_ID}`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	update(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId, @Body() dto: UpdateGroupDto) {
		return this.groupsService.update(id, dto)
	}

	@HttpCode(204)
	@Delete(`:${PARAMS.GROUP_ID}`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	delete(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId) {
		return this.groupsService.delete(id)
	}

	@Post(`:${PARAMS.GROUP_ID}/join`)
	@UseGuards(GroupExistsGuard)
	join(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId, @CurrentUserId() userId: UserId) {
		return this.groupsService.join(id, userId)
	}

	@Post(`:${PARAMS.GROUP_ID}/leave`)
	@UseGuards(GroupExistsGuard)
	leave(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId, @CurrentUserId() userId: UserId) {
		return this.groupsService.leave(id, userId)
	}

	@Post(`:${PARAMS.GROUP_ID}/kick/:userId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	kick(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() ownerId: UserId
	) {
		return this.groupsService.kick(id, ownerId, targetUserId)
	}

	@Post(`:${PARAMS.GROUP_ID}/ban/:userId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	ban(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() ownerId: UserId
	) {
		return this.groupsService.ban(id, ownerId, targetUserId)
	}

	@Get(`:${PARAMS.GROUP_ID}/blacklist`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	getBlackList(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Query('skip') skip: number,
		@Query('take') take: number,
		@Query('search') search?: string
	) {
		return this.groupsService.getBlackList(id, Number(skip) || 0, Number(take) || 100, search)
	}

	@Post(`:${PARAMS.GROUP_ID}/unban/:userId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	unban(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId
	) {
		return this.groupsService.unban(id, targetUserId)
	}

	@Get(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	getInviteLinks(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId) {
		return this.groupsService.getGroupInviteLinks(id)
	}

	@Post(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	createInviteLink(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@CurrentUserId() userId: UserId,
		@Body() dto: CreateInviteLinkDto
	) {
		return this.groupsService.createGroupInviteLink(id, userId, dto)
	}

	@Patch(`:${PARAMS.GROUP_ID}/invite-links/:linkId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	updateInviteLink(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('linkId', ParseIntPipe) linkId: number,
		@Body() dto: UpdateInviteLinkDto
	) {
		return this.groupsService.updateGroupInviteLink(id, linkId, dto)
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(`:${PARAMS.GROUP_ID}/invite-links/:linkId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	deleteInviteLink(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('linkId', ParseIntPipe) linkId: number
	) {
		return this.groupsService.deleteGroupInviteLink(id, linkId)
	}
}

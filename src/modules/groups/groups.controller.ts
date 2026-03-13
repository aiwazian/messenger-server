import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { GroupsService } from './groups.service'
import { AuthGuard } from 'src/common/guards/auth.guard'
import { CreateGroupDto } from './dto/create-group.dto'
import { CurrentUserId } from 'src/common/decorators/user-id.decorator'
import { UserId } from 'src/common/types/user-id.type'
import { GroupId } from 'src/common/types/group-id.type'
import { ParseGroupIdPipe } from 'src/common/pipes/parse-group-id.pipe'
import { GroupOwnerGuard } from 'src/common/guards/group-owner.guard'
import { GroupExistsGuard } from 'src/common/guards/group-exists.guard'
import { PARAMS } from 'src/common/constants/param.constants'
import { UpdateGroupDto } from './dto/update-group.dto'
import { ParseUserIdPipe } from 'src/common/pipes/parse-user-id.pipe'
import { CanReadChatGuard } from 'src/common/guards/can-read-chat.guard'

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
    constructor(private readonly groupsService: GroupsService) { }

    @Post()
    createGroup(@CurrentUserId() userId: UserId, @Body() dto: CreateGroupDto) {
        return this.groupsService.create(userId, dto)
    }

    @Get(`:${PARAMS.GROUP_ID}`)
    @UseGuards(GroupExistsGuard)
    getById(
        @Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
        @CurrentUserId() userId: UserId
    ) {
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

    @Patch(`:${PARAMS.GROUP_ID}`)
    @UseGuards(GroupExistsGuard, GroupOwnerGuard)
    update(
        @Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
        @Body() dto: UpdateGroupDto,
        @CurrentUserId() userId: UserId
    ) {
        return this.groupsService.update(id, dto, userId)
    }

    @HttpCode(204)
    @Delete(`:${PARAMS.GROUP_ID}`)
    @UseGuards(GroupExistsGuard, GroupOwnerGuard)
    delete(
        @Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
        @CurrentUserId() userId: UserId
    ) {
        return this.groupsService.delete(id, userId)
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
}

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
	Put,
	Query,
	UseGuards
} from '@nestjs/common'
import { GroupsService } from './groups.service'
import { CreateGroupDto } from './dto/create-group.dto'
import { UpdateGroupDto } from './dto/update-group.dto'
import { AddMembersDto } from './dto/add-members.dto'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { PARAMS } from '../../common/constants/param.constants'
import { GroupExistsGuard } from '../../common/guards/group-exists.guard'
import { ParseGroupIdPipe } from '../../common/pipes/parse-group-id.pipe'
import { GroupId } from '../../common/types/group-id.type'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { GroupOwnerGuard } from '../../common/guards/group-owner.guard'
import { GroupAdminGuard } from '../../common/guards/group-admin.guard'
import { RequireAdminPermission } from '../../common/decorators/admin-permission.decorator'
import { ParseUserIdPipe } from '../../common/pipes/parse-user-id.pipe'
import { ParseIntPipe } from '@nestjs/common'
import { CreateInviteLinkDto } from '../../common/dtos/create-invite-link.dto'
import { UpdateInviteLinkDto } from '../../common/dtos/update-invite-link.dto'
import { SetNoCopyDto } from '../../common/dtos/set-no-copy.dto'
import { CreateGroupUseCase } from './use-cases/create-group.use-case'
import { FileInitDto } from '../messages/dto/file-init.dto'
import { StorageService } from '../storage/storage.service'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { FileType } from '../../common/enums/file-type.enum'
import { GroupAdminsService } from './group-admins.service'
import { UpsertGroupAdminDto } from './dto/group-admin.dto'

@Controller('groups')
export class GroupsController {
	constructor(
		private readonly groupsService: GroupsService,
		private readonly createGroupUseCase: CreateGroupUseCase,
		private readonly storageService: StorageService,
		private readonly groupAdminsService: GroupAdminsService
	) {}

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

	/**
	 * Теги участников группы.
	 *
	 * Нужны любому участнику: тег рисуется рядом с именем отправителя в сообщениях.
	 */
	@Get(`:${PARAMS.GROUP_ID}/member-tags`)
	@UseGuards(GroupExistsGuard, CanReadChatGuard)
	getMemberTags(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId) {
		return this.groupAdminsService.getTags(id)
	}

	/**
	 * Права текущего пользователя в группе.
	 *
	 * Клиент решает по ним, показывать ли кнопки редактирования и ссылок.
	 */
	@Get(`:${PARAMS.GROUP_ID}/admins/me`)
	@UseGuards(GroupExistsGuard)
	getMyPermissions(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@CurrentUserId() userId: UserId
	) {
		return this.groupAdminsService.getMyPermissions(id, userId)
	}

	/** Список администраторов группы: только владелец. */
	@Get(`:${PARAMS.GROUP_ID}/admins`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	getAdmins(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId) {
		return this.groupAdminsService.list(id)
	}

	/**
	 * Назначить администратора или перезаписать его права и тег.
	 *
	 * Назначать администраторов может только владелец группы.
	 */
	@Put(`:${PARAMS.GROUP_ID}/admins/:userId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	upsertAdmin(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() ownerId: UserId,
		@Body() dto: UpsertGroupAdminDto
	) {
		return this.groupAdminsService.upsert(id, targetUserId, ownerId, dto)
	}

	/** Снять администратора группы вместе с его тегом. */
	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(`:${PARAMS.GROUP_ID}/admins/:userId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	removeAdmin(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId
	) {
		return this.groupAdminsService.remove(id, targetUserId)
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

	/**
	 * Включить или выключить запрет копирования.
	 *
	 * Доступно только владельцу группы: GroupOwnerGuard.
	 */
	@Patch(`:${PARAMS.GROUP_ID}/no-copy`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	setNoCopy(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId, @Body() dto: SetNoCopyDto) {
		return this.groupsService.setNoCopy(id, dto.noCopy)
	}

	/**
	 * Изменение профиля группы: название и описание.
	 *
	 * Доступно владельцу и администраторам с правом canEditProfile.
	 */
	@Patch(`:${PARAMS.GROUP_ID}`)
	@UseGuards(GroupExistsGuard, GroupAdminGuard)
	@RequireAdminPermission('canEditProfile')
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

	@Get(`:${PARAMS.GROUP_ID}/join-requests`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	getJoinRequests(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Query('skip') skip: number,
		@Query('take') take: number,
		@Query('search') search?: string
	) {
		return this.groupsService.getJoinRequests(id, Number(skip) || 0, Number(take) || 100, search)
	}

	@Post(`:${PARAMS.GROUP_ID}/join-requests/:userId/accept`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	acceptJoinRequest(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId
	) {
		return this.groupsService.acceptJoinRequest(id, targetUserId)
	}

	@Post(`:${PARAMS.GROUP_ID}/join-requests/:userId/reject`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	rejectJoinRequest(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId
	) {
		return this.groupsService.rejectJoinRequest(id, targetUserId)
	}

	@Post(`:${PARAMS.GROUP_ID}/unban/:userId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	unban(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId
	) {
		return this.groupsService.unban(id, targetUserId)
	}

	/**
	 * Пригласительные ссылки группы.
	 *
	 * Доступно владельцу и администраторам с правом canManageInviteLinks.
	 */
	@Get(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupAdminGuard)
	@RequireAdminPermission('canManageInviteLinks')
	getInviteLinks(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId) {
		return this.groupsService.getGroupInviteLinks(id)
	}

	@Post(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupAdminGuard)
	@RequireAdminPermission('canManageInviteLinks')
	createInviteLink(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@CurrentUserId() userId: UserId,
		@Body() dto: CreateInviteLinkDto
	) {
		return this.groupsService.createGroupInviteLink(id, userId, dto)
	}

	@Patch(`:${PARAMS.GROUP_ID}/invite-links/:linkId`)
	@UseGuards(GroupExistsGuard, GroupAdminGuard)
	@RequireAdminPermission('canManageInviteLinks')
	updateInviteLink(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('linkId', ParseIntPipe) linkId: number,
		@Body() dto: UpdateInviteLinkDto
	) {
		return this.groupsService.updateGroupInviteLink(id, linkId, dto)
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(`:${PARAMS.GROUP_ID}/invite-links/:linkId`)
	@UseGuards(GroupExistsGuard, GroupAdminGuard)
	@RequireAdminPermission('canManageInviteLinks')
	deleteInviteLink(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('linkId', ParseIntPipe) linkId: number
	) {
		return this.groupsService.deleteGroupInviteLink(id, linkId)
	}

	@Post(`:${PARAMS.GROUP_ID}/avatar/init`)
	@UseGuards(GroupExistsGuard, GroupAdminGuard)
	@RequireAdminPermission('canEditProfile')
	initFileUpload(@Body() dto: FileInitDto) {
		return this.storageService.initUpload(dto.name, dto.size, FileType.GROUP_AVATAR)
	}

	@Post(`:${PARAMS.GROUP_ID}/avatar/confirm/:fileId`)
	@UseGuards(GroupExistsGuard, GroupAdminGuard)
	@RequireAdminPermission('canEditProfile')
	confirmFileUpload(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('fileId') fileId: string
	) {
		return this.groupsService.confirmUploadAvatar(id, fileId)
	}

	@Delete(`:${PARAMS.GROUP_ID}/avatars/:fileId`)
	@UseGuards(GroupExistsGuard, GroupAdminGuard)
	@RequireAdminPermission('canEditProfile')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteAvatar(
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Param('fileId') fileId: string
	) {
		return this.groupsService.deleteAvatar(id, fileId)
	}

	@Get('avatars/:fileId')
	async getAvatarDownloadUrl(@Param('fileId') fileId: string): Promise<FileDownloadDto> {
		return this.groupsService.getAvatarDownloadUrl(fileId)
	}
}

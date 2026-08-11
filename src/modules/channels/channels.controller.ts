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
import { ChannelsService } from './channels.service'
import { CreateChannelDto } from './dto/create-channel.dto'
import { UpdateChannelDto } from './dto/update-channel.dto'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { ChannelExistsGuard } from '../../common/guards/channel-exists.guard'
import { PARAMS } from '../../common/constants/param.constants'
import { ParseChannelIdPipe } from '../../common/pipes/parse-channel-id.pipe'
import { ChannelId } from '../../common/types/channel-id.type'
import { ChannelOwnerGuard } from '../../common/guards/channel-owner.guard'
import { ChannelAdminGuard } from '../../common/guards/channel-admin.guard'
import { RequireAdminPermission } from '../../common/decorators/admin-permission.decorator'
import { ParseUserIdPipe } from '../../common/pipes/parse-user-id.pipe'
import { ParseIntPipe } from '@nestjs/common'
import { CreateInviteLinkDto } from '../../common/dtos/create-invite-link.dto'
import { UpdateInviteLinkDto } from '../../common/dtos/update-invite-link.dto'
import { SetNoCopyDto } from '../../common/dtos/set-no-copy.dto'
import { CreateChannelUseCase } from './use-cases/create-channel.use-case'
import { FileInitDto } from '../messages/dto/file-init.dto'
import { StorageService } from '../storage/storage.service'
import { AvatarAccessService } from '../storage/services/avatar-access.service'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { FileType } from '../../common/enums/file-type.enum'
import { UploadCategory } from '../../common/enums/upload-category.enum'
import { ChannelAdminsService } from './channel-admins.service'
import { UpsertChannelAdminDto } from './dto/channel-admin.dto'

@Controller('channels')
export class ChannelsController {
	constructor(
		private readonly channelsService: ChannelsService,
		private readonly createChannelUseCase: CreateChannelUseCase,
		private readonly storageService: StorageService,
		private readonly avatarAccess: AvatarAccessService,
		private readonly channelAdminsService: ChannelAdminsService
	) {}

	@Post()
	createChannel(@CurrentUserId() userId: UserId, @Body() dto: CreateChannelDto) {
		return this.createChannelUseCase.execute(userId, dto)
	}

	@Get(`:${PARAMS.CHANNEL_ID}`)
	@UseGuards(ChannelExistsGuard)
	getChannelById(
		@CurrentUserId() userId: UserId,
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId
	) {
		return this.channelsService.getById(id, userId)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/subscribers`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	getSubscribers(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Query('skip') skip: string = '0',
		@Query('take') take: string = '100',
		@Query('search') search?: string
	) {
		return this.channelsService.getSubscribers(id, parseInt(skip), parseInt(take), search)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/admins/me`)
	@UseGuards(ChannelExistsGuard)
	getMyPermissions(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@CurrentUserId() userId: UserId
	) {
		return this.channelAdminsService.getMyPermissions(id, userId)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/admins/candidates`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canManageAdmins')
	getAdminCandidates(@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId) {
		return this.channelAdminsService.listCandidates(id)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/admins`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canManageAdmins')
	getAdmins(@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId) {
		return this.channelAdminsService.list(id)
	}

	@Put(`:${PARAMS.CHANNEL_ID}/admins/:userId`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canManageAdmins')
	upsertAdmin(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() currentUserId: UserId,
		@Body() dto: UpsertChannelAdminDto
	) {
		return this.channelAdminsService.upsert(id, targetUserId, currentUserId, dto)
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(`:${PARAMS.CHANNEL_ID}/admins/:userId`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canManageAdmins')
	removeAdmin(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() currentUserId: UserId
	) {
		return this.channelAdminsService.remove(id, targetUserId, currentUserId)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/transfer-ownership/:userId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	transferOwnership(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() ownerId: UserId
	) {
		return this.channelsService.transferOwnership(id, ownerId, targetUserId)
	}

	@Patch(`:${PARAMS.CHANNEL_ID}/no-copy`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	setNoCopy(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Body() dto: SetNoCopyDto
	) {
		return this.channelsService.setNoCopy(id, dto.noCopy)
	}

	@Patch(`:${PARAMS.CHANNEL_ID}`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canEditProfile')
	updateChannel(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Body() dto: UpdateChannelDto
	) {
		return this.channelsService.update(id, dto)
	}

	@HttpCode(204)
	@Delete(`:${PARAMS.CHANNEL_ID}`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	delete(@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId) {
		return this.channelsService.delete(id)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/join`)
	@UseGuards(ChannelExistsGuard)
	join(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@CurrentUserId() userId: UserId
	) {
		return this.channelsService.join(id, userId)
	}

	@Delete(`:${PARAMS.CHANNEL_ID}/leave`)
	@UseGuards(ChannelExistsGuard)
	leave(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@CurrentUserId() userId: UserId
	) {
		return this.channelsService.leave(id, userId)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/kick/:userId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	kick(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() ownerId: UserId
	) {
		return this.channelsService.kick(id, ownerId, targetUserId)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/ban/:userId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	ban(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() ownerId: UserId
	) {
		return this.channelsService.ban(id, ownerId, targetUserId)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/banned-users`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	getBannedUsers(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Query('skip') skip: string = '0',
		@Query('take') take: string = '100',
		@Query('search') search?: string
	) {
		return this.channelsService.getBannedUsers(id, parseInt(skip), parseInt(take), search)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/unban/:userId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	unban(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId,
		@CurrentUserId() ownerId: UserId
	) {
		return this.channelsService.unban(id, ownerId, targetUserId)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/is-banned`)
	@UseGuards(ChannelExistsGuard)
	isBanned(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@CurrentUserId() userId: UserId
	) {
		return this.channelsService.isBanned(id, userId)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/join-requests`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	getJoinRequests(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Query('skip') skip: string = '0',
		@Query('take') take: string = '100',
		@Query('search') search?: string
	) {
		return this.channelsService.getJoinRequests(id, parseInt(skip), parseInt(take), search)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/join-requests/:userId/accept`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	acceptJoinRequest(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId
	) {
		return this.channelsService.acceptJoinRequest(id, targetUserId)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/join-requests/:userId/reject`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	rejectJoinRequest(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('userId', ParseUserIdPipe) targetUserId: UserId
	) {
		return this.channelsService.rejectJoinRequest(id, targetUserId)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/invite-links`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canManageInviteLinks')
	getInviteLinks(@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId) {
		return this.channelsService.getChannelInviteLinks(id)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/invite-links`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canManageInviteLinks')
	createInviteLink(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@CurrentUserId() userId: UserId,
		@Body() dto: CreateInviteLinkDto
	) {
		return this.channelsService.createChannelInviteLink(id, userId, dto)
	}

	@Patch(`:${PARAMS.CHANNEL_ID}/invite-links/:linkId`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canManageInviteLinks')
	updateInviteLink(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('linkId', ParseIntPipe) linkId: number,
		@Body() dto: UpdateInviteLinkDto
	) {
		return this.channelsService.updateChannelInviteLink(id, linkId, dto)
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(`:${PARAMS.CHANNEL_ID}/invite-links/:linkId`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canManageInviteLinks')
	deleteInviteLink(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('linkId', ParseIntPipe) linkId: number
	) {
		return this.channelsService.deleteChannelInviteLink(id, linkId)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/avatar/init`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canEditProfile')
	initFileUpload(@Body() dto: FileInitDto) {
		return this.storageService.initUpload({
			...dto,
			category: UploadCategory.IMAGE,
			directory: FileType.CHANNEL_AVATAR
		})
	}

	@Post(`:${PARAMS.CHANNEL_ID}/avatar/confirm/:fileId`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canEditProfile')
	confirmFileUpload(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('fileId') fileId: string
	) {
		return this.channelsService.confirmUploadAvatar(id, fileId)
	}

	@Delete(`:${PARAMS.CHANNEL_ID}/avatars/:fileId`)
	@UseGuards(ChannelExistsGuard, ChannelAdminGuard)
	@RequireAdminPermission('canEditProfile')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteAvatar(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('fileId') fileId: string
	) {
		return this.channelsService.deleteAvatar(id, fileId)
	}

	@Get('avatars/:fileId')
	getAvatarDownloadUrl(
		@CurrentUserId() userId: UserId,
		@Param('fileId') fileId: string
	): Promise<FileDownloadDto> {
		return this.avatarAccess.getChannelAvatarDownloadUrl(userId, fileId)
	}
}

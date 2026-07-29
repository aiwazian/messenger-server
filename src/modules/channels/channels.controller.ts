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
import { ParseUserIdPipe } from '../../common/pipes/parse-user-id.pipe'
import { ParseIntPipe } from '@nestjs/common'
import { CreateInviteLinkDto } from '../../common/dtos/create-invite-link.dto'
import { UpdateInviteLinkDto } from '../../common/dtos/update-invite-link.dto'
import { SetNoCopyDto } from '../../common/dtos/set-no-copy.dto'
import { CreateChannelUseCase } from './use-cases/create-channel.use-case'
import { FileInitDto } from '../messages/dto/file-init.dto'
import { StorageService } from '../storage/storage.service'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { FileType } from '../../common/enums/file-type.enum'

@Controller('channels')
export class ChannelsController {
	constructor(
		private readonly channelsService: ChannelsService,
		private readonly createChannelUseCase: CreateChannelUseCase,
		private readonly storageService: StorageService
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

	/**
	 * Включить или выключить запрет копирования.
	 *
	 * Доступно только владельцу канала: ChannelOwnerGuard.
	 */
	@Patch(`:${PARAMS.CHANNEL_ID}/no-copy`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	setNoCopy(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Body() dto: SetNoCopyDto
	) {
		return this.channelsService.setNoCopy(id, dto.noCopy)
	}

	@Patch(`:${PARAMS.CHANNEL_ID}`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
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
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	getInviteLinks(@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId) {
		return this.channelsService.getChannelInviteLinks(id)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/invite-links`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	createInviteLink(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@CurrentUserId() userId: UserId,
		@Body() dto: CreateInviteLinkDto
	) {
		return this.channelsService.createChannelInviteLink(id, userId, dto)
	}

	@Patch(`:${PARAMS.CHANNEL_ID}/invite-links/:linkId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	updateInviteLink(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('linkId', ParseIntPipe) linkId: number,
		@Body() dto: UpdateInviteLinkDto
	) {
		return this.channelsService.updateChannelInviteLink(id, linkId, dto)
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(`:${PARAMS.CHANNEL_ID}/invite-links/:linkId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	deleteInviteLink(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('linkId', ParseIntPipe) linkId: number
	) {
		return this.channelsService.deleteChannelInviteLink(id, linkId)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/avatar/init`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	initFileUpload(@Body() dto: FileInitDto) {
		return this.storageService.initUpload(dto.name, dto.size, FileType.CHANNEL_AVATAR)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/avatar/confirm/:fileId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	confirmFileUpload(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('fileId') fileId: string
	) {
		return this.channelsService.confirmUploadAvatar(id, fileId)
	}

	@Delete(`:${PARAMS.CHANNEL_ID}/avatars/:fileId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteAvatar(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Param('fileId') fileId: string
	) {
		return this.channelsService.deleteAvatar(id, fileId)
	}

	@Get('avatars/:fileId')
	async getAvatarDownloadUrl(@Param('fileId') fileId: string): Promise<FileDownloadDto> {
		return this.channelsService.getAvatarDownloadUrl(fileId)
	}
}

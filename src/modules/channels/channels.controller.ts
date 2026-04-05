import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
	Query,
	UseGuards
} from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { AuthGuard } from 'src/common/guards/auth.guard'
import { ParseChannelIdPipe } from 'src/common/pipes/parse-channel-id.pipe'
import { ChannelId } from 'src/common/types/channel-id.type'
import { CreateChannelDto } from './dto/create-channel.dto'
import { CurrentUserId } from 'src/common/decorators/user-id.decorator'
import { UserId } from 'src/common/types/user-id.type'
import { ChannelOwnerGuard } from 'src/common/guards/channel-owner.guard'
import { ChannelExistsGuard } from 'src/common/guards/channel-exists.guard'
import { UpdateChannelDto } from './dto/update-channel.dto'
import { PARAMS } from 'src/common/constants/param.constants'
import { ParseUserIdPipe } from 'src/common/pipes/parse-user-id.pipe'

@Controller('channels')
@UseGuards(AuthGuard)
export class ChannelsController {
	constructor(private readonly channelsService: ChannelsService) {}

	@Post()
	createChannel(@CurrentUserId() userId: UserId, @Body() dto: CreateChannelDto) {
		return this.channelsService.create(userId, dto)
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

	@Patch(`:${PARAMS.CHANNEL_ID}`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	updateChannel(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Body() dto: UpdateChannelDto,
		@CurrentUserId() userId: UserId
	) {
		return this.channelsService.update(id, dto, userId)
	}

	@HttpCode(204)
	@Delete(`:${PARAMS.CHANNEL_ID}`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	delete(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@CurrentUserId() userId: UserId
	) {
		return this.channelsService.delete(id, userId)
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
}

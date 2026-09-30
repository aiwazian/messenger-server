import {
	Body,
	Controller,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	UseGuards
} from '@nestjs/common'
import { ChannelCommentsService } from './channel-comments.service'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { ChannelExistsGuard } from '../../common/guards/channel-exists.guard'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { PARAMS } from '../../common/constants/param.constants'
import { ParseChannelIdPipe } from '../../common/pipes/parse-channel-id.pipe'
import { ChannelId } from '../../common/types/channel-id.type'
import { CreateCommentDto } from './dto/create-comment.dto'
import { ConfirmCommentDto } from './dto/confirm-comment.dto'
import { FileInitDto } from '../messages/dto/file-init.dto'

@Controller('channels')
export class ChannelCommentsController {
	constructor(private readonly channelCommentsService: ChannelCommentsService) {}

	@Get(`:${PARAMS.CHANNEL_ID}/posts/:${PARAMS.MESSAGE_ID}/comments`)
	@UseGuards(ChannelExistsGuard, CanReadChatGuard)
	list(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) channelId: ChannelId,
		@Param(PARAMS.MESSAGE_ID, ParseIntPipe) postId: number,
		@CurrentUserId() userId: UserId
	) {
		return this.channelCommentsService.list(channelId, postId, userId)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/posts/:${PARAMS.MESSAGE_ID}/comments`)
	@UseGuards(ChannelExistsGuard, CanReadChatGuard)
	create(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) channelId: ChannelId,
		@Param(PARAMS.MESSAGE_ID, ParseIntPipe) postId: number,
		@CurrentUserId() userId: UserId,
		@Body() dto: CreateCommentDto,
		@Headers('x-socket-id') socketId: string
	) {
		return this.channelCommentsService.create(channelId, postId, userId, dto, socketId)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/posts/:${PARAMS.MESSAGE_ID}/comments/files/init`)
	@UseGuards(ChannelExistsGuard, CanReadChatGuard)
	initFileUpload(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) channelId: ChannelId,
		@Param(PARAMS.MESSAGE_ID, ParseIntPipe) postId: number,
		@CurrentUserId() userId: UserId,
		@Body() dto: FileInitDto
	) {
		return this.channelCommentsService.initFileUpload(channelId, postId, userId, dto)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/posts/:${PARAMS.MESSAGE_ID}/comments/confirm`)
	@UseGuards(ChannelExistsGuard, CanReadChatGuard)
	confirm(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) channelId: ChannelId,
		@Param(PARAMS.MESSAGE_ID, ParseIntPipe) postId: number,
		@CurrentUserId() userId: UserId,
		@Body() dto: ConfirmCommentDto,
		@Headers('x-socket-id') socketId: string
	) {
		return this.channelCommentsService.confirm(channelId, postId, userId, dto, socketId)
	}

	@Get(`:${PARAMS.CHANNEL_ID}/posts/:${PARAMS.MESSAGE_ID}/comments/:commentId/files/:fileId/download`)
	@UseGuards(ChannelExistsGuard, CanReadChatGuard)
	getFileDownloadUrl(
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) channelId: ChannelId,
		@Param(PARAMS.MESSAGE_ID, ParseIntPipe) postId: number,
		@Param('commentId', ParseIntPipe) commentId: number,
		@Param('fileId') fileId: string
	) {
		return this.channelCommentsService.getFileDownloadUrl(channelId, postId, commentId, fileId)
	}
}

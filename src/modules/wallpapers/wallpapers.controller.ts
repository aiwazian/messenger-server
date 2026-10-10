import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	Put,
	Query,
	UseGuards
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { WallpapersService } from './wallpapers.service'
import { SetWallpaperDto } from './dto/set-wallpaper.dto'
import { SetChatWallpaperDto } from './dto/set-chat-wallpaper.dto'
import {
	ChatWallpaperResponseDto,
	WallpaperResponseDto
} from './dto/wallpaper-response.dto'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChannelId } from '../../common/types/channel-id.type'
import { GroupId } from '../../common/types/group-id.type'
import { CanReadChatGuard } from '../../common/guards/can-read-chat.guard'
import { ChannelExistsGuard } from '../../common/guards/channel-exists.guard'
import { ChannelOwnerGuard } from '../../common/guards/channel-owner.guard'
import { GroupExistsGuard } from '../../common/guards/group-exists.guard'
import { GroupOwnerGuard } from '../../common/guards/group-owner.guard'
import { ParseChatIdPipe } from '../../common/pipes/parse-chat-id.pipe'
import { ParseChannelIdPipe } from '../../common/pipes/parse-channel-id.pipe'
import { ParseGroupIdPipe } from '../../common/pipes/parse-group-id.pipe'
import { FileInitDto } from '../messages/dto/file-init.dto'
import { StorageService } from '../storage/storage.service'
import { FileType } from '../../common/enums/file-type.enum'
import { UploadCategory } from '../../common/enums/upload-category.enum'

@Controller()
export class WallpapersController {
	constructor(
		private readonly wallpapers: WallpapersService,
		private readonly storage: StorageService
	) {}

	@Post('users/me/wallpaper/init')
	initUpload(@Body() dto: FileInitDto) {
		return this.storage.initUpload({
			...dto,
			category: UploadCategory.IMAGE,
			directory: FileType.WALLPAPER
		})
	}

	@Post('users/me/wallpaper/confirm/:fileId')
	confirmUpload(@Param('fileId') fileId: string) {
		return this.storage.confirmUpload(fileId)
	}

	@Get('users/me/wallpaper')
	async getMy(@CurrentUserId() userId: UserId): Promise<ChatWallpaperResponseDto> {
		return plainToInstance(ChatWallpaperResponseDto, {
			wallpaper: await this.wallpapers.getMy(userId)
		})
	}

	@Put('users/me/wallpaper')
	setMy(
		@CurrentUserId() userId: UserId,
		@Body() dto: SetWallpaperDto
	): Promise<WallpaperResponseDto> {
		return this.wallpapers.setMy(userId, dto)
	}

	@Delete('users/me/wallpaper')
	@HttpCode(HttpStatus.NO_CONTENT)
	resetMy(@CurrentUserId() userId: UserId): Promise<void> {
		return this.wallpapers.resetMy(userId)
	}

	@Get('chats/:chatId/wallpaper')
	@UseGuards(CanReadChatGuard)
	async getChat(
		@CurrentUserId() userId: UserId,
		@Param('chatId', ParseChatIdPipe) chatId: ChatId
	): Promise<ChatWallpaperResponseDto> {
		return plainToInstance(ChatWallpaperResponseDto, {
			wallpaper: await this.wallpapers.getChatWallpaper(userId, chatId)
		})
	}

	@Put('chats/:chatId/wallpaper')
	@UseGuards(CanReadChatGuard)
	setChat(
		@CurrentUserId() userId: UserId,
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Body() dto: SetChatWallpaperDto
	): Promise<WallpaperResponseDto> {
		return this.wallpapers.setChatWallpaper(userId, chatId, dto)
	}

	@Delete('chats/:chatId/wallpaper')
	@HttpCode(HttpStatus.NO_CONTENT)
	@UseGuards(CanReadChatGuard)
	resetChat(
		@CurrentUserId() userId: UserId,
		@Param('chatId', ParseChatIdPipe) chatId: ChatId,
		@Query('scope') scope?: string
	): Promise<void> {
		return this.wallpapers.resetChatWallpaper(userId, chatId, scope === 'all' ? 'all' : 'me')
	}

	@Put('channels/:channelId/wallpaper')
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	setChannelWallpaper(
		@Param('channelId', ParseChannelIdPipe) channelId: ChannelId,
		@Body() dto: SetWallpaperDto
	): Promise<WallpaperResponseDto> {
		return this.wallpapers.setChannelWallpaper(channelId, dto)
	}

	@Delete('channels/:channelId/wallpaper')
	@HttpCode(HttpStatus.NO_CONTENT)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	resetChannelWallpaper(
		@Param('channelId', ParseChannelIdPipe) channelId: ChannelId
	): Promise<void> {
		return this.wallpapers.resetChannelWallpaper(channelId)
	}

	@Put('groups/:groupId/wallpaper')
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	setGroupWallpaper(
		@Param('groupId', ParseGroupIdPipe) groupId: GroupId,
		@Body() dto: SetWallpaperDto
	): Promise<WallpaperResponseDto> {
		return this.wallpapers.setGroupWallpaper(groupId, dto)
	}

	@Delete('groups/:groupId/wallpaper')
	@HttpCode(HttpStatus.NO_CONTENT)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	resetGroupWallpaper(@Param('groupId', ParseGroupIdPipe) groupId: GroupId): Promise<void> {
		return this.wallpapers.resetGroupWallpaper(groupId)
	}
}

import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	Patch,
	Post
} from '@nestjs/common'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { ChatFoldersService } from './chat-folders.service'
import { ChatFolderResponseDto } from './dto/chat-folder-response.dto'
import { CreateChatFolderDto } from './dto/create-chat-folder.dto'
import { PinFolderChatsDto } from './dto/pin-folder-chats.dto'
import { ReorderChatFoldersDto } from './dto/reorder-chat-folders.dto'
import { UpdateChatFolderDto } from './dto/update-chat-folder.dto'

@Controller('chat-folders')
export class ChatFoldersController {
	constructor(private readonly chatFoldersService: ChatFoldersService) {}

	@Get()
	async getFolders(@CurrentUserId() userId: UserId): Promise<ChatFolderResponseDto[]> {
		return this.chatFoldersService.getFolders(userId)
	}

	@Post()
	async createFolder(
		@CurrentUserId() userId: UserId,
		@Body() dto: CreateChatFolderDto
	): Promise<ChatFolderResponseDto> {
		return this.chatFoldersService.createFolder(userId, dto)
	}

	@Post('reorder')
	async reorderFolders(
		@CurrentUserId() userId: UserId,
		@Body() dto: ReorderChatFoldersDto
	): Promise<ChatFolderResponseDto[]> {
		return this.chatFoldersService.reorderFolders(userId, dto)
	}

	@Patch(':folderId')
	async updateFolder(
		@CurrentUserId() userId: UserId,
		@Param('folderId', ParseIntPipe) folderId: number,
		@Body() dto: UpdateChatFolderDto
	): Promise<ChatFolderResponseDto> {
		return this.chatFoldersService.updateFolder(userId, folderId, dto)
	}

	@Delete(':folderId')
	@HttpCode(HttpStatus.NO_CONTENT)
	async deleteFolder(
		@CurrentUserId() userId: UserId,
		@Param('folderId', ParseIntPipe) folderId: number
	): Promise<void> {
		await this.chatFoldersService.deleteFolder(userId, folderId)
	}

	@Post(':folderId/pin')
	@HttpCode(HttpStatus.NO_CONTENT)
	async pinChats(
		@CurrentUserId() userId: UserId,
		@Param('folderId', ParseIntPipe) folderId: number,
		@Body() dto: PinFolderChatsDto
	): Promise<void> {
		await this.chatFoldersService.setChatsPinned(userId, folderId, dto, true)
	}

	@Post(':folderId/unpin')
	@HttpCode(HttpStatus.NO_CONTENT)
	async unpinChats(
		@CurrentUserId() userId: UserId,
		@Param('folderId', ParseIntPipe) folderId: number,
		@Body() dto: PinFolderChatsDto
	): Promise<void> {
		await this.chatFoldersService.setChatsPinned(userId, folderId, dto, false)
	}
}

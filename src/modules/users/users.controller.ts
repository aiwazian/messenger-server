import {
	Body,
	Controller,
	Get,
	Param,
	Patch,
	UseGuards,
	Request,
	HttpCode,
	HttpStatus,
	Delete,
	Post
} from '@nestjs/common'
import { UsersService } from './users.service'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserResponseDto } from './dto/user-response.dto'
import { PrivacySettingsDto } from './dto/privacy-settings.dto'
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { AuthGuard } from '../../common/guards/auth.guard'
import { CurrentSession } from '../../common/decorators/session.decorator'
import { UserId } from '../../common/types/user-id.type'
import { UserExistsGuard } from '../../common/guards/user-exists.guard'
import { PARAMS } from '../../common/constants/param.constants'
import { PrivacyGuard } from '../../common/guards/privacy.guard'
import { ParseUserIdPipe } from '../../common/pipes/parse-user-id.pipe'
import { StorageService } from '../storage/storage.service'
import { FileInitDto } from '../messages/dto/file-init.dto'
import { InitUploadDto } from '../storage/dto/init-upload.dto'
import { FileDownloadDto } from '../messages/dto/file-download.dto'
import { FileType } from '../../common/enums/file-type.enum'

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
	constructor(
		private readonly usersService: UsersService,
		private readonly storage: StorageService
	) { }

	@Delete('me')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteMe(@CurrentUserId() userId: UserId, @CurrentSession() session: any): Promise<void> {
		return this.usersService.deleteMe(userId, session)
	}

	@Patch('me/password')
	@HttpCode(HttpStatus.OK)
	changePassword(@CurrentUserId() userId: UserId, @Body() dto: ChangePasswordDto): Promise<void> {
		return this.usersService.changePassword(userId, dto)
	}

	@Get('me')
	getMe(@CurrentUserId() userId: UserId): Promise<UserResponseDto> {
		return this.usersService.getById(userId)
	}

	@Patch('me')
	updateMe(@CurrentUserId() userId: UserId, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
		return this.usersService.updateUser(userId, dto)
	}

	@Get('me/privacy')
	getPrivacySettings(@CurrentUserId() userId: UserId): Promise<PrivacySettingsDto> {
		return this.usersService.getPrivacySettings(userId)
	}

	@Patch('me/privacy')
	updatePrivacySettings(
		@CurrentUserId() userId: UserId,
		@Body() dto: UpdatePrivacySettingsDto
	): Promise<PrivacySettingsDto> {
		return this.usersService.updatePrivacySettings(userId, dto)
	}

	@Post('me/avatar/init')
	initFileUpload(@Body() dto: FileInitDto): Promise<InitUploadDto> {
		return this.storage.initUpload(dto.name, dto.size, FileType.USER_AVATAR)
	}

	@Post('me/avatar/confirm/:fileId')
	confirmFileUpload(@Param('fileId') fileId: string, @CurrentUserId() userId: UserId) {
		return this.usersService.confirmUploadAvatar(userId, fileId)
	}

	@Delete('me/avatars/:fileId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteAvatar(@CurrentUserId() userId: UserId, @Param('fileId') fileId: string): Promise<void> {
		return this.usersService.deleteAvatar(userId, fileId)
	}

	@Get('avatars/:fileId')
	async getAvatarDownloadUrl(@Param('fileId') fileId: string): Promise<FileDownloadDto> {
		return this.usersService.getAvatarDownloadUrl(fileId)
	}

	@Get(`:${PARAMS.USER_ID}`)
	@UseGuards(UserExistsGuard, PrivacyGuard)
	async getUserProfile(
		@Param(PARAMS.USER_ID, ParseUserIdPipe) id: UserId,
		@CurrentUserId() currentUserId: UserId,
		@Request() req: any
	): Promise<UserResponseDto> {
		const response = await this.usersService.getById(id, currentUserId)

		if (id === currentUserId) {
			return response
		}

		if (req.privacy) {
			if (!req.privacy.canSeeBio) {
				response.bio = undefined
			}
			if (!req.privacy.canSeeDateOfBirth) {
				response.dateOfBirth = undefined
			}
		}

		return response
	}
}

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
	Delete
} from '@nestjs/common'
import { UsersService } from './users.service'
import { AuthGuard } from 'src/common/guards/auth.guard'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserId } from 'src/common/types/user-id.type'
import { ParseUserIdPipe } from 'src/common/pipes/parse-user-id.pipe'
import { CurrentUserId } from 'src/common/decorators/user-id.decorator'
import { UserResponseDto } from './dto/user-response.dto'
import { PARAMS } from 'src/common/constants/param.constants'
import { UserExistsGuard } from 'src/common/guards/user-exists.guard'
import { PrivacySettingsDto } from './dto/privacy-settings.dto'
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto'
import { PrivacyGuard } from 'src/common/guards/privacy.guard'
import { ChangePasswordDto } from './dto/change-password.dto'

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Delete('me')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteMe(@CurrentUserId() userId: UserId): Promise<void> {
		return this.usersService.deleteMe(userId)
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
				response.bio = null
			}
			if (!req.privacy.canSeeDateOfBirth) {
				response.dateOfBirth = null
			}
		}

		return response
	}
}

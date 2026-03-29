import {
	ConflictException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
	Inject,
	forwardRef
} from '@nestjs/common'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserId } from 'src/common/types/user-id.type'
import { ChatId } from 'src/common/types/chat-id.type'
import { ConversationType, Prisma, FileStatus } from 'generated/prisma/client'
import { plainToInstance } from 'class-transformer'
import { UserResponseDto } from './dto/user-response.dto'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { SearchService } from '../search/search.service'
import { PrivacySettingsDto } from './dto/privacy-settings.dto'
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto'
import { hashPassword, verifyPassword } from 'src/common/utils/password.util'
import { ChangePasswordDto } from './dto/change-password.dto'
import { StorageService } from '../storage/storage.service'
import { SessionsService } from '../sessions/sessions.service'

@Injectable()
export class UsersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly searchService: SearchService,
		@Inject(forwardRef(() => StorageService))
		private readonly storageService: StorageService,
		private readonly sessionsService: SessionsService
	) {}

	async deleteMe(userId: UserId): Promise<void> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } })
		if (!user) throw new NotFoundException('User not found')

		// 1. Find all files associated with messages from this user
		const files = await this.prisma.file.findMany({
			where: {
				message: {
					sender: {
						userId: userId
					}
				}
			}
		})

		// 2. Schedule files for deletion (now asynchronous and resilient in StorageService)
		for (const file of files) {
			await this.storageService.deleteFile(file.id)
		}

		// 3. Logout from all sessions and kick from websocket
		await this.sessionsService.deleteAll(userId)

		// 4. Delete user. Prisma cascade will handle the rest
		await this.prisma.user.delete({
			where: { id: userId }
		})

		// 5. Cleanup empty conversations (DIRECT chats where everyone left)
		await this.prisma.conversation.deleteMany({
			where: {
				type: ConversationType.DIRECT,
				members: { none: {} }
			}
		})
	}

	async changePassword(id: UserId, dto: ChangePasswordDto): Promise<void> {
		const user = await this.prisma.user.findUnique({ where: { id } })
		if (!user) throw new NotFoundException('User not found')

		const passwordHash = await hashPassword(dto.password)
		await this.prisma.user.update({
			where: { id },
			data: { password: passwordHash }
		})
	}

	async updateUser(id: UserId, dto: UpdateUserDto): Promise<UserResponseDto> {
		const user = await this.prisma.user.findUnique({ where: { id } })
		if (!user) throw new NotFoundException('User not found')

		if (dto.username && dto.username !== user.username) {
			const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
			if (!isAvailable) throw new ConflictException('Username is already taken')
		}

		const updatedUser = await this.prisma.user.update({
			where: { id: id },
			data: {
				firstName: dto.firstName,
				lastName: dto.lastName || null,
				username: dto.username || null,
				bio: dto.bio || null,
				dateOfBirth: dto.dateOfBirth || null
			}
		})

		return plainToInstance(UserResponseDto, updatedUser)
	}

	async getById(id: UserId, currentUserId?: UserId): Promise<UserResponseDto> {
		const user = await this.prisma.user.findUnique({
			where: { id: id },
			include: { privacySettings: true }
		})

		if (!user) throw new NotFoundException('User not found')

		const response = plainToInstance(UserResponseDto, user)

		if (currentUserId && currentUserId !== id) {
			const privacy = user.privacySettings
			if (privacy) {
				if (privacy.bio === 1) {
					response.bio = null
				}
				if (privacy.dateOfBirth === 1) {
					response.dateOfBirth = null
				}
			}
		}

		return response
	}

	async getPrivacySettings(userId: UserId): Promise<PrivacySettingsDto> {
		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId }
		})
		if (!settings) {
			return plainToInstance(PrivacySettingsDto, {
				lastSeen: 0,
				messages: 0,
				bio: 0,
				dateOfBirth: 0,
				invites: 0
			})
		}
		return plainToInstance(PrivacySettingsDto, settings)
	}

	async updatePrivacySettings(
		userId: UserId,
		dto: UpdatePrivacySettingsDto
	): Promise<PrivacySettingsDto> {
		const settings = await this.prisma.privacySettings.upsert({
			where: { userId },
			update: dto,
			create: {
				userId,
				lastSeen: dto.lastSeen ?? 0,
				messages: dto.messages ?? 0,
				bio: dto.bio ?? 0,
				dateOfBirth: dto.dateOfBirth ?? 0,
				invites: dto.invites ?? 0
			}
		})
		return plainToInstance(PrivacySettingsDto, settings)
	}

	async isExists(id: UserId): Promise<boolean> {
		return !!(await this.prisma.user.findFirst({ where: { id } }))
	}
}

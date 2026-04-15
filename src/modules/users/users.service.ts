import {
	ConflictException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
	ForbiddenException,
	Inject,
	forwardRef
} from '@nestjs/common'
import { UpdateUserDto } from './dto/update-user.dto'
import { plainToInstance } from 'class-transformer'
import { UserResponseDto } from './dto/user-response.dto'
import { SearchService } from '../search/search.service'
import { PrivacySettingsDto } from './dto/privacy-settings.dto'
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { StorageService } from '../storage/storage.service'
import { SessionsService } from '../sessions/sessions.service'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { hashPassword } from '../../common/utils/password.util'

@Injectable()
export class UsersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly searchService: SearchService,
		@Inject(forwardRef(() => StorageService))
		private readonly storageService: StorageService,
		private readonly sessionsService: SessionsService
	) {}

	async deleteMe(userId: UserId, session: any): Promise<void> {
		const currentTime = BigInt(Date.now())
		const sessionCreatedAt = BigInt(session.createdAt)
		const twentyFourHoursInMs = BigInt(24 * 60 * 60 * 1000)

		if (currentTime - sessionCreatedAt < twentyFourHoursInMs) {
			throw new ForbiddenException('Чтобы завершить сессию должно пройти 24 часа с начала сессии')
		}

		const user = await this.prisma.user.findUnique({ where: { id: userId } })
		if (!user) throw new NotFoundException('User not found')

		// 1. Find all files associated with messages from this user
		const files = await this.prisma.file.findMany({
			where: {
				message: {
					senderId: userId
				}
			}
		})

		// 2. Schedule files for deletion
		for (const file of files) {
			await this.storageService.deleteFile(file.id)
		}

		// 3. Logout from all sessions and kick from websocket
		await this.sessionsService.deleteAll(userId)

		// 4. Delete user. Prisma cascade will handle the rest
		await this.prisma.user.delete({ where: { id: userId } })
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
					response.bio = undefined
				}
				if (privacy.dateOfBirth === 1) {
					response.dateOfBirth = undefined
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

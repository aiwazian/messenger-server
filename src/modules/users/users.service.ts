import {
	ConflictException,
	Injectable,
	NotFoundException,
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
import { PrivacyRule } from '../../../generated/prisma/enums'

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
				attachments: {
					some: {
						message: {
							senderId: userId
						}
					}
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
			include: {
				privacySettings: true,
				photos: {
					orderBy: [{ sortOrder: 'asc' }]
				}
			}
		})

		if (!user) throw new NotFoundException('User not found')

		const response = plainToInstance(UserResponseDto, user)
		response.avatars = user.photos.map((p) => ({ fileId: p.fileId, sortOrder: p.sortOrder }))

		if (currentUserId && currentUserId !== id) {
			const privacy = user.privacySettings
			if (privacy) {
				if (privacy.bio === PrivacyRule.NOBODY) {
					response.bio = undefined
				}
				if (privacy.dateOfBirth === PrivacyRule.NOBODY) {
					response.dateOfBirth = undefined
				}
				if (privacy.lastSeen === PrivacyRule.NOBODY) {
					response.lastSeen = undefined
				} else if (user.lastSeen) {
					response.lastSeen = Number(user.lastSeen)
				}
			}
		} else if (user.lastSeen) {
			response.lastSeen = Number(user.lastSeen)
		}

		return response
	}

	async getPrivacySettings(userId: UserId): Promise<PrivacySettingsDto> {
		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId }
		})
		if (!settings) {
			return plainToInstance(PrivacySettingsDto, {
				lastSeen: PrivacyRule.EVERYBODY,
				messages: PrivacyRule.EVERYBODY,
				bio: PrivacyRule.EVERYBODY,
				dateOfBirth: PrivacyRule.EVERYBODY,
				invites: PrivacyRule.EVERYBODY
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
				lastSeen: dto.lastSeen ?? PrivacyRule.EVERYBODY,
				messages: dto.messages ?? PrivacyRule.EVERYBODY,
				bio: dto.bio ?? PrivacyRule.EVERYBODY,
				dateOfBirth: dto.dateOfBirth ?? PrivacyRule.EVERYBODY,
				invites: dto.invites ?? PrivacyRule.EVERYBODY
			}
		})
		return plainToInstance(PrivacySettingsDto, settings)
	}

	async confirmUploadAvatar(userId: UserId, fileId: string): Promise<void> {
		const file = await this.prisma.file.findFirst({
			where: { id: fileId }
		})

		if (file == null) {
			throw new NotFoundException('File not found')
		}

		await this.storageService.confirmUpload(fileId)

		const lastPhoto = await this.prisma.userPhoto.findFirst({
			where: { userId },
			orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }]
		})
		const nextSortOrder = lastPhoto ? lastPhoto.sortOrder + 1 : 0

		await this.prisma.userPhoto.create({
			data: {
				userId: userId,
				fileId: file.id,
				isCurrent: true,
				sortOrder: nextSortOrder
			}
		})
	}

	async deleteAvatar(userId: UserId, fileId: string): Promise<void> {
		const photo = await this.prisma.userPhoto.findFirst({
			where: { userId, fileId }
		})
		if (!photo) throw new NotFoundException('Avatar not found')

		await this.prisma.userPhoto.delete({
			where: { fileId }
		})
		await this.storageService.deleteFile(fileId)
	}

	async isExists(id: UserId): Promise<boolean> {
		return !!(await this.prisma.user.findFirst({ where: { id } }))
	}
}

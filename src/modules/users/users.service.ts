import {
	ConflictException,
	Injectable,
	NotFoundException,
	ForbiddenException,
	Inject,
	forwardRef,
	Logger
} from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
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
import { FileDownloadDto } from '../messages/dto/file-download.dto'

@Injectable()
export class UsersService {
	private readonly logger = new Logger(UsersService.name)

	constructor(
		private readonly prisma: PrismaService,
		private readonly searchService: SearchService,
		@Inject(forwardRef(() => StorageService))
		private readonly storageService: StorageService,
		private readonly sessionsService: SessionsService
	) { }

	@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
	async deleteInactiveAccounts() {
		const privacySettings = await this.prisma.privacySettings.findMany({
			where: {
				deleteAfterDays: { gt: 0 }
			},
			include: {
				user: {
					include: {
						sessions: true
					}
				}
			}
		})

		const now = Date.now()

		for (const setting of privacySettings) {
			const user = setting.user
			if (!user) continue

			const deleteAfterMs = setting.deleteAfterDays * 24 * 60 * 60 * 1000
			const thresholdTime = now - deleteAfterMs

			const idStr = user.id.toString()
			const createdAtStr = idStr.substring(1, idStr.length - 5)
			const createdAt = Number(createdAtStr)

			let maxActivity = createdAt || 0

			for (const session of user.sessions) {
				const sessionActivity = Number(session.lastSeen || session.createdAt)
				if (sessionActivity > maxActivity) {
					maxActivity = sessionActivity
				}
			}

			if (maxActivity > 0 && maxActivity < thresholdTime) {
				try {
					const userId = UserId(user.id)

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
				} catch (error: any) {
					this.logger.error(`Failed to delete inactive user ${user.id}: ${error.message}`)
				}
			}
		}
	}

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
				},
				sessions: {
					orderBy: [{ lastSeen: 'desc' }],
					take: 1
				}
			}
		})

		if (!user) throw new NotFoundException('User not found')

		const response = plainToInstance(UserResponseDto, user)
		response.avatars = user.photos.map((p) => ({ fileId: p.fileId, sortOrder: p.sortOrder }))

		const latestSession = user.sessions?.[0]
		const lastSeenVal = latestSession?.lastSeen ? Number(latestSession.lastSeen) : undefined

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
				} else if (lastSeenVal) {
					response.lastSeen = lastSeenVal
				}
			}
		} else if (lastSeenVal) {
			response.lastSeen = lastSeenVal
		}

		return response
	}

	async getPrivacySettings(userId: UserId): Promise<PrivacySettingsDto> {
		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId }
		})
		return plainToInstance(PrivacySettingsDto, settings)
	}

	async updatePrivacySettings(
		userId: UserId,
		dto: UpdatePrivacySettingsDto
	): Promise<PrivacySettingsDto> {
		const settings = await this.prisma.privacySettings.update({
			where: { userId },
			data: dto
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

	async getAvatarDownloadUrl(fileId: string): Promise<FileDownloadDto> {
		const photo = await this.prisma.userPhoto.findFirst({
			where: { fileId }
		})
		if (!photo) throw new NotFoundException('Avatar not found')
		return this.storageService.getDownloadUrl(fileId)
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

import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
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
import { Prisma } from '../../generated/prisma/client'
import { PrivacyRule } from '../../generated/prisma/enums'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SocketEvent } from '../../common/socket/socket-events'
import { EmailVerificationStore } from './email-verification.store'
import { EmailResponseDto } from './dto/email-response.dto'
import { MailService } from '../mail/mail.service'
import { PrivacyAccessService } from '../../common/privacy/privacy-access.service'
import {
	PRIVACY_FIELD_BY_KEY,
	PRIVACY_FIELD_KEYS,
	PRIVACY_KEY_BY_FIELD,
	PrivacyExceptionListsResponseDto,
	PrivacyExceptionsResponseDto,
	PrivacyExceptionsUpdateDto
} from './dto/privacy-exceptions.dto'
import { PrivacyExceptionKind, PrivacyField } from '../../generated/prisma/enums'

@Injectable()
export class UsersService {
	private readonly logger = new Logger(UsersService.name)

	constructor(
		private readonly prisma: PrismaService,
		private readonly searchService: SearchService,
		@Inject(forwardRef(() => StorageService))
		private readonly storageService: StorageService,
		private readonly sessionsService: SessionsService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly emailVerificationStore: EmailVerificationStore,
		private readonly mailService: MailService,
		private readonly privacyAccess: PrivacyAccessService
	) {}

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

					for (const file of files) {
						await this.storageService.deleteFile(file.id)
					}

					await this.sessionsService.deleteAll(userId)

					await this.prisma.user.delete({ where: { id: userId } })
				} catch (error: any) {
					this.logger.error(`Failed to delete inactive user ${user.id}: ${error.message}`)
				}
			}
		}
	}

	async deleteMe(userId: UserId): Promise<void> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } })
		if (!user) throw new NotFoundException('User not found')

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

		for (const file of files) {
			await this.storageService.deleteFile(file.id)
		}

		await this.sessionsService.deleteAll(userId)

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

	async changeLogin(id: UserId, login: string): Promise<void> {
		const user = await this.prisma.user.findUnique({ where: { id } })
		if (!user) throw new NotFoundException('User not found')

		if (login !== user.username) {
			const isAvailable = await this.searchService.isUsernameAvailable(login)
			if (!isAvailable) throw new ConflictException('Username is already taken')
		}

		await this.prisma.user.update({
			where: { id },
			data: { username: login }
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
		response.canForwardAndCopy = true

		if (user.profileChannelId) {
			response.profileChannelId = user.profileChannelId.toString()
		}

		const latestSession = user.sessions?.[0]
		const lastSeenVal = latestSession?.lastSeen ? Number(latestSession.lastSeen) : undefined

		if (currentUserId && currentUserId !== id) {
			const blackLists = await this.prisma.userBlackList.findMany({
				where: {
					OR: [
						{ blockerId: currentUserId, blockedId: id },
						{ blockerId: id, blockedId: currentUserId }
					]
				}
			})

			for (const bl of blackLists) {
				if (bl.blockerId === currentUserId) response.isBlocked = true
				if (bl.blockerId === id) response.isBlockedByThem = true
			}

			const privacy = user.privacySettings
			const exceptions = await this.privacyAccess.getExceptionsForOwner(id, [
				PrivacyField.BIO,
				PrivacyField.DATE_OF_BIRTH,
				PrivacyField.PROFILE_PHOTO,
				PrivacyField.LAST_SEEN,
				PrivacyField.FORWARD_AND_COPY
			])
			const viewerSettings = await this.prisma.privacySettings.findUnique({
				where: { userId: currentUserId },
				select: { forwardAndCopy: true }
			})
			const viewerAllowsForwardAndCopy = viewerSettings?.forwardAndCopy !== PrivacyRule.NOBODY
			const canSee = (field: PrivacyField, rule: PrivacyRule | undefined) =>
				this.privacyAccess.isAllowed(
					rule ?? PrivacyRule.EVERYBODY,
					exceptions.get(field),
					currentUserId
				)

			if (!canSee(PrivacyField.BIO, privacy?.bio)) {
				response.bio = undefined
			}
			if (!canSee(PrivacyField.DATE_OF_BIRTH, privacy?.dateOfBirth)) {
				response.dateOfBirth = undefined
			}
			if (!canSee(PrivacyField.PROFILE_PHOTO, privacy?.profilePhoto) || response.isBlockedByThem) {
				response.avatars = []
			}
			if (!canSee(PrivacyField.LAST_SEEN, privacy?.lastSeen) || response.isBlockedByThem) {
				response.lastSeen = undefined
			} else if (lastSeenVal) {
				response.lastSeen = lastSeenVal
			}
			if (
				!canSee(PrivacyField.FORWARD_AND_COPY, privacy?.forwardAndCopy) ||
				!viewerAllowsForwardAndCopy
			) {
				response.canForwardAndCopy = false
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
		const response = plainToInstance(PrivacySettingsDto, settings)
		response.exceptions = await this.buildExceptionsResponse(userId)
		return response
	}

	async updatePrivacySettings(
		userId: UserId,
		dto: UpdatePrivacySettingsDto
	): Promise<PrivacySettingsDto> {
		const oldSettings = await this.prisma.privacySettings.findUnique({
			where: { userId },
			select: { lastSeen: true }
		})

		const settings = await this.prisma.$transaction(async (tx) => {
			const updated = await tx.privacySettings.update({
				where: { userId },
				data: {
					lastSeen: dto.lastSeen,
					messages: dto.messages,
					bio: dto.bio,
					dateOfBirth: dto.dateOfBirth,
					invites: dto.invites,
					profilePhoto: dto.profilePhoto,
					forwardedProfile: dto.forwardedProfile,
					forwardAndCopy: dto.forwardAndCopy,
					deleteAfterDays: dto.deleteAfterDays
				}
			})

			if (dto.exceptions) {
				await this.replaceExceptions(tx, userId, dto.exceptions)
			}

			return updated
		})

		if (dto.lastSeen !== undefined && dto.lastSeen !== oldSettings?.lastSeen) {
			const chats = await this.prisma.chat.findMany({
				where: { userId },
				select: { chatId: true }
			})

			const recipientIds = chats.filter((c) => c.chatId !== userId).map((c) => c.chatId)

			if (dto.lastSeen === PrivacyRule.NOBODY) {
				for (const recipientId of recipientIds) {
					this.realtimeGateway.sendToUser(UserId(recipientId), SocketEvent.USER_OFFLINE, {
						userId: userId.toString()
					})
				}
			} else if (dto.lastSeen === PrivacyRule.EVERYBODY) {
				if (this.realtimeGateway.isUserOnline(userId)) {
					for (const recipientId of recipientIds) {
						if (this.realtimeGateway.isUserOnline(UserId(recipientId))) {
							this.realtimeGateway.sendToUser(UserId(recipientId), SocketEvent.USER_ONLINE, {
								userId: userId.toString()
							})
						}
					}
				}
			}
		}

		const response = plainToInstance(PrivacySettingsDto, settings)
		response.exceptions = await this.buildExceptionsResponse(userId)
		return response
	}

	private async replaceExceptions(
		tx: Prisma.TransactionClient,
		userId: UserId,
		exceptions: PrivacyExceptionsUpdateDto
	): Promise<void> {
		for (const key of PRIVACY_FIELD_KEYS) {
			const lists = exceptions[key]
			if (!lists) continue
			if (lists.alwaysShow === undefined && lists.alwaysHide === undefined) continue

			const field = PRIVACY_FIELD_BY_KEY[key]
			const showIds = await this.resolveExceptionTargets(tx, lists.alwaysShow ?? [])
			const hideIds = await this.resolveExceptionTargets(tx, lists.alwaysHide ?? [])

			await tx.privacyException.deleteMany({
				where: { ownerId: userId, field }
			})

			const rows = [
				...showIds.map((targetId) => ({
					ownerId: userId,
					targetId,
					field,
					kind: PrivacyExceptionKind.ALWAYS_SHOW
				})),
				...hideIds.map((targetId) => ({
					ownerId: userId,
					targetId,
					field,
					kind: PrivacyExceptionKind.ALWAYS_HIDE
				}))
			]

			if (rows.length > 0) {
				await tx.privacyException.createMany({ data: rows })
			}
		}
	}

	private async resolveExceptionTargets(
		tx: Prisma.TransactionClient,
		rawIds: string[]
	): Promise<bigint[]> {
		const ids = new Set<string>()
		for (const raw of rawIds) {
			try {
				ids.add(BigInt(raw).toString())
			} catch {
				throw new BadRequestException('Invalid user id in privacy exceptions')
			}
		}

		if (ids.size === 0) return []

		const parsed = [...ids].map((value) => BigInt(value))
		const existing = await tx.user.findMany({
			where: { id: { in: parsed } },
			select: { id: true }
		})

		return existing.map((user) => user.id)
	}

	private async buildExceptionsResponse(userId: UserId): Promise<PrivacyExceptionsResponseDto> {
		const exceptions = await this.privacyAccess.getExceptionsForOwner(userId, [
			...Object.values(PrivacyField)
		])
		const response = new PrivacyExceptionsResponseDto()

		for (const field of Object.values(PrivacyField)) {
			const lists = exceptions.get(field)
			response[PRIVACY_KEY_BY_FIELD[field]] = new PrivacyExceptionListsResponseDto(
				[...(lists?.alwaysShow ?? [])],
				[...(lists?.alwaysHide ?? [])]
			)
		}

		return response
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

	async setProfileChannel(userId: UserId, channelId: string): Promise<void> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: BigInt(channelId) }
		})
		if (!channel) throw new NotFoundException('Channel not found')

		if (channel.channelType !== 'PUBLIC') {
			throw new BadRequestException('Only public channels can be set as profile channel')
		}

		await this.prisma.user.update({
			where: { id: userId },
			data: { profileChannelId: BigInt(channelId) }
		})
	}

	async removeProfileChannel(userId: UserId): Promise<void> {
		await this.prisma.user.update({
			where: { id: userId },
			data: { profileChannelId: null }
		})
	}

	async getOwnedPublicChannels(userId: UserId): Promise<any[]> {
		const channels = await this.prisma.channel.findMany({
			where: {
				ownerId: userId,
				channelType: 'PUBLIC'
			},
			include: {
				photos: {
					where: { isCurrent: true },
					take: 1
				},
				_count: {
					select: { subscribers: true }
				}
			}
		})

		return channels.map((ch) => ({
			id: ch.id.toString(),
			name: ch.name,
			subscribers: ch._count.subscribers,
			avatar: ch.photos[0] ? { fileId: ch.photos[0].fileId } : undefined
		}))
	}

	async blockUser(blockerId: UserId, blockedId: UserId): Promise<void> {
		if (blockerId === blockedId) {
			throw new BadRequestException('You cannot block yourself')
		}
		const user = await this.prisma.user.findUnique({ where: { id: blockedId } })
		if (!user) throw new NotFoundException('User not found')

		await this.prisma.userBlackList.upsert({
			where: {
				blockerId_blockedId: { blockerId, blockedId }
			},
			update: {},
			create: {
				blockerId,
				blockedId,
				createdAt: Date.now()
			}
		})
	}

	async unblockUser(blockerId: UserId, blockedId: UserId): Promise<void> {
		await this.prisma.userBlackList.deleteMany({
			where: { blockerId, blockedId }
		})
	}

	async getBlockedUsers(userId: UserId): Promise<UserResponseDto[]> {
		const blackLists = await this.prisma.userBlackList.findMany({
			where: { blockerId: userId },
			include: {
				blocked: {
					include: {
						photos: {
							orderBy: [{ sortOrder: 'asc' }]
						}
					}
				}
			}
		})

		return blackLists.map((bl) => {
			const response = plainToInstance(UserResponseDto, bl.blocked)
			response.avatars = bl.blocked.photos.map((p) => ({
				fileId: p.fileId,
				sortOrder: p.sortOrder
			}))
			return response
		})
	}

	async getPendingJoinRequests(userId: UserId) {
		const groupRequests = await this.prisma.groupJoinRequest.findMany({
			where: { userId },
			include: {
				group: {
					include: { photos: { where: { isCurrent: true }, take: 1 } }
				}
			},
			orderBy: { createdAt: 'desc' }
		})

		const channelRequests = await this.prisma.channelJoinRequest.findMany({
			where: { userId },
			include: {
				channel: {
					include: { photos: { where: { isCurrent: true }, take: 1 } }
				}
			},
			orderBy: { createdAt: 'desc' }
		})

		const pendingRequests = [
			...groupRequests.map((r) => ({
				chatId: r.groupId.toString(),
				chatName: r.group.name,
				createdAt: r.createdAt.toString(),
				avatarFileId: r.group.photos[0]?.fileId || null
			})),
			...channelRequests.map((r) => ({
				chatId: r.channelId.toString(),
				chatName: r.channel.name,
				createdAt: r.createdAt.toString(),
				avatarFileId: r.channel.photos[0]?.fileId || null
			}))
		]

		pendingRequests.sort((a, b) => Number(BigInt(b.createdAt) - BigInt(a.createdAt)))

		return pendingRequests
	}

	async cancelJoinRequest(userId: UserId, chatId: string): Promise<void> {
		const chatBigInt = BigInt(chatId)

		await this.prisma.$transaction(async (tx) => {
			await tx.groupJoinRequest.deleteMany({
				where: { userId, groupId: chatBigInt }
			})
			await tx.channelJoinRequest.deleteMany({
				where: { userId, channelId: chatBigInt }
			})
		})
	}

	async setEmail(userId: UserId, email: string): Promise<void> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } })
		if (!user) throw new NotFoundException('User not found')

		const existing = await this.prisma.user.findUnique({ where: { email } })
		if (existing && existing.id !== userId) {
			throw new ConflictException('Email is already in use')
		}

		const code = await this.emailVerificationStore.generateCode(userId, email)

		await this.mailService.sendVerifyEmail(email, code)
	}

	async verifyEmail(userId: UserId, code: string): Promise<EmailResponseDto> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } })
		if (!user) throw new NotFoundException('User not found')

		const result = await this.emailVerificationStore.verify(userId, code)
		if (!result.valid || !result.email) {
			throw new BadRequestException('Invalid verification code')
		}

		try {
			await this.prisma.user.update({
				where: { id: userId },
				data: { email: result.email }
			})
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new ConflictException('Email is already in use')
			}
			throw error
		}

		return plainToInstance(EmailResponseDto, result)
	}

	async disableEmail(userId: UserId): Promise<void> {
		await this.prisma.user.update({
			where: { id: userId },
			data: { email: null }
		})

		await this.emailVerificationStore.delete(userId)
	}

	async getEmail(userId: UserId): Promise<EmailResponseDto | null> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { email: true }
		})
		if (!user) throw new NotFoundException('User not found')

		return plainToInstance(EmailResponseDto, user)
	}
}

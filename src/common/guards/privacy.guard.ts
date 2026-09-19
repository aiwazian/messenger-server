import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { PARAMS } from '../constants/param.constants'
import { UserId } from '../types/user-id.type'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { PrivacyRule } from '../../generated/prisma/enums'
import { PrivacyField } from '../../generated/prisma/enums'
import { PrivacyAccessService } from '../privacy/privacy-access.service'

@Injectable()
export class PrivacyGuard implements CanActivate {
	constructor(
		private readonly prisma: PrismaService,
		private readonly privacyAccess: PrivacyAccessService
	) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const targetUserIdRaw = request.params[PARAMS.USER_ID]
		if (!targetUserIdRaw) return true

		const targetUserId = UserId(targetUserIdRaw)
		const currentUserId = request.user?.id

		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId: targetUserId }
		})

		const exceptions = await this.privacyAccess.getExceptionsForOwner(targetUserId, [
			PrivacyField.BIO,
			PrivacyField.DATE_OF_BIRTH,
			PrivacyField.PROFILE_PHOTO,
			PrivacyField.FORWARD_AND_COPY
		])

		if (!settings) {
			const userExists = (await this.prisma.user.count({ where: { id: targetUserId } })) > 0
			if (!userExists) throw new NotFoundException('User not found')

			request.privacy = {
				canSeeBio: this.privacyAccess.isAllowed(
					PrivacyRule.EVERYBODY,
					exceptions.get(PrivacyField.BIO),
					currentUserId
				),
				canSeeDateOfBirth: this.privacyAccess.isAllowed(
					PrivacyRule.EVERYBODY,
					exceptions.get(PrivacyField.DATE_OF_BIRTH),
					currentUserId
				),
				canSeeProfilePhoto: this.privacyAccess.isAllowed(
					PrivacyRule.EVERYBODY,
					exceptions.get(PrivacyField.PROFILE_PHOTO),
					currentUserId
				),
				canForwardAndCopy:
					this.privacyAccess.isAllowed(
						PrivacyRule.EVERYBODY,
						exceptions.get(PrivacyField.FORWARD_AND_COPY),
						currentUserId
					) && (await this.allowsForwardAndCopy(currentUserId))
			}
			return true
		}

		if (targetUserId === currentUserId) {
			request.privacy = {
				canSeeBio: true,
				canSeeDateOfBirth: true,
				canSeeProfilePhoto: true,
				canForwardAndCopy: true
			}
			return true
		}

		request.privacy = {
			canSeeBio: this.privacyAccess.isAllowed(
				settings.bio,
				exceptions.get(PrivacyField.BIO),
				currentUserId
			),
			canSeeDateOfBirth: this.privacyAccess.isAllowed(
				settings.dateOfBirth,
				exceptions.get(PrivacyField.DATE_OF_BIRTH),
				currentUserId
			),
			canSeeProfilePhoto: this.privacyAccess.isAllowed(
				settings.profilePhoto,
				exceptions.get(PrivacyField.PROFILE_PHOTO),
				currentUserId
			),
			canForwardAndCopy:
				this.privacyAccess.isAllowed(
					settings.forwardAndCopy,
					exceptions.get(PrivacyField.FORWARD_AND_COPY),
					currentUserId
				) && (await this.allowsForwardAndCopy(currentUserId))
		}

		return true
	}

	private async allowsForwardAndCopy(userId?: string | bigint | number): Promise<boolean> {
		if (!userId) return true

		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId: UserId(userId) },
			select: { forwardAndCopy: true }
		})

		return settings?.forwardAndCopy !== PrivacyRule.NOBODY
	}
}

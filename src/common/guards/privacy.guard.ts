import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { PARAMS } from '../constants/param.constants'
import { UserId } from '../types/user-id.type'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { PrivacyRule } from '../../generated/prisma/enums'

@Injectable()
export class PrivacyGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const targetUserIdRaw = request.params[PARAMS.USER_ID]
		if (!targetUserIdRaw) return true

		const targetUserId = UserId(targetUserIdRaw)
		const currentUserId = request.user?.id

		const settings = await this.prisma.privacySettings.findUnique({
			where: { userId: targetUserId }
		})

		if (!settings) {
			const userExists = (await this.prisma.user.count({ where: { id: targetUserId } })) > 0
			if (!userExists) throw new NotFoundException('User not found')

			request.privacy = {
				canSeeBio: true,
				canSeeDateOfBirth: true,
				canSeeProfilePhoto: true,
				canForwardAndCopy: await this.allowsForwardAndCopy(currentUserId)
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
			canSeeBio: settings.bio === PrivacyRule.EVERYBODY,
			canSeeDateOfBirth: settings.dateOfBirth === PrivacyRule.EVERYBODY,
			canSeeProfilePhoto: settings.profilePhoto === PrivacyRule.EVERYBODY,
			canForwardAndCopy:
				settings.forwardAndCopy === PrivacyRule.EVERYBODY &&
				(await this.allowsForwardAndCopy(currentUserId))
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

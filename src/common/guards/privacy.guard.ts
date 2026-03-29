import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { PARAMS } from '../constants/param.constants'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { UserId } from '../types/user-id.type'

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
				canSeeDateOfBirth: true
			}
			return true
		}

		if (targetUserId === currentUserId) {
			request.privacy = {
				canSeeBio: true,
				canSeeDateOfBirth: true
			}
			return true
		}

		request.privacy = {
			canSeeBio: settings.bio === 0,
			canSeeDateOfBirth: settings.dateOfBirth === 0
		}

		return true
	}
}

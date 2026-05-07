import {
	Injectable,
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	NotFoundException
} from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../types/user-id.type'

@Injectable()
export class InviteLinkOwnerGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const userId: UserId = request.user.id
		const inviteLinkId = parseInt(request.params['inviteLinkId'])

		if (isNaN(inviteLinkId)) {
			throw new NotFoundException('Invite link not found')
		}

		let creatorId: bigint | undefined

		const channelLink = await this.prisma.channelInviteLink.findUnique({
			where: { id: inviteLinkId }
		})

		if (channelLink) {
			creatorId = channelLink.creatorId
		} else {
			const groupLink = await this.prisma.groupInviteLink.findUnique({
				where: { id: inviteLinkId }
			})
			if (groupLink) {
				creatorId = groupLink.creatorId
			}
		}

		if (!creatorId) {
			throw new NotFoundException('Invite link not found')
		}

		if (creatorId !== userId) {
			throw new ForbiddenException('You are not allowed to modify this invite link')
		}

		return true
	}
}

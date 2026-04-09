import {
	Injectable,
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	NotFoundException
} from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'

@Injectable()
export class InviteLinkOwnerGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) { }

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const inviteLinkId = BigInt(request.params.inviteLinkId)

		const link = await this.prisma.inviteLink.findUnique({
			where: { id: inviteLinkId },
			include: { conversation: true }
		})

		if (!link) {
			throw new NotFoundException('Invite link not found')
		}

		const { conversation } = link

		if (conversation.channelId) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: conversation.channelId }
			})
			if (channel?.ownerId !== user.id) {
				throw new ForbiddenException('You are not the owner of this channel')
			}
		} else if (conversation.groupId) {
			const group = await this.prisma.group.findUnique({
				where: { id: conversation.groupId }
			})
			if (group?.ownerId !== user.id) {
				throw new ForbiddenException('You are not the owner of this group')
			}
		} else {
			throw new ForbiddenException('Conversation type not supported for invite link ownership check')
		}

		return true
	}
}

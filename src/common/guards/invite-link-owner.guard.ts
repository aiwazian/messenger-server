import {
	Injectable,
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	NotFoundException
} from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChatType } from '../enums/chat-type.enum'
import { detectChatType } from '../utils/detect-chat-type.util'
import { ChatId } from '../types/chat-id.type'

@Injectable()
export class InviteLinkOwnerGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) { }

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const inviteLinkId = BigInt(request.params.inviteLinkId)

		const link = await this.prisma.inviteLink.findUnique({
			where: { id: inviteLinkId }
		})

		if (!link) {
			throw new NotFoundException('Invite link not found')
		}

		const chatType = detectChatType(ChatId(link.chatId))

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: link.chatId }
			})
			if (channel?.ownerId !== user.id) {
				throw new ForbiddenException('You are not the owner of this channel')
			}
		} else if (chatType === ChatType.GROUP) {
			const group = await this.prisma.group.findUnique({
				where: { id: link.chatId }
			})
			if (group?.ownerId !== user.id) {
				throw new ForbiddenException('You are not the owner of this group')
			}
		} else {
			throw new ForbiddenException('Invite links are not supported for direct chats')
		}

		return true
	}
}

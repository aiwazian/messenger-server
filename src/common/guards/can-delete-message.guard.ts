import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { UserId } from '../types/user-id.type'
import { PARAMS } from '../constants/param.constants'
import { detectChatType } from '../utils/detect-chat-type.util'
import { ChatType } from '../enums/chat-type.enum'
import { ConversationType } from 'generated/prisma/client'

@Injectable()
export class CanDeleteMessageGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const userId: UserId = request.user.id
		const messageId = parseInt(request.params[PARAMS.MESSAGE_ID])

		if (isNaN(messageId)) {
			throw new NotFoundException('Message not found')
		}

		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			include: { conversation: true }
		})

		if (!message) {
			throw new NotFoundException('Message not found')
		}

		// 1. User is sender
		if (message.senderId === userId) {
			return true
		}

		// 2. User is a member of the direct chat (allow deleting anyone's message in DM)
		if (message.conversation.type === ConversationType.DIRECT) {
			const member = await this.prisma.conversationMember.findFirst({
				where: { conversationId: message.conversation.id, userId: userId }
			})
			if (member) return true
		}

		// 3. User is owner of the group/channel
		if (message.conversation.type === ConversationType.GROUP) {
			const group = await this.prisma.group.findFirst({
				where: { id: message.conversation.id, ownerId: userId }
			})
			if (group) return true
		}

		if (message.conversation.type === ConversationType.CHANNEL) {
			const channel = await this.prisma.channel.findFirst({
				where: { id: message.conversation.id, ownerId: userId }
			})
			if (channel) return true
		}

		throw new ForbiddenException('You cannot delete this message')
	}
}

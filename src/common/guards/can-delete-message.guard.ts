import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { UserId } from '../types/user-id.type'
import { PARAMS } from '../constants/param.constants'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChatType } from '../enums/chat-type.enum'
import { detectChatType } from '../utils/detect-chat-type.util'
import { ChatId } from '../types/chat-id.type'

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
			where: { id: messageId }
		})

		if (!message) {
			throw new NotFoundException('Message not found')
		}

		if (message.senderId === userId) {
			return true
		}

		const chatType = detectChatType(ChatId(message.chatId))

		if (chatType === ChatType.PRIVATE) {
			return true
		}

		if (chatType === ChatType.GROUP) {
			const group = await this.prisma.group.findFirst({
				where: { id: message.chatId, ownerId: userId }
			})
			if (group) return true
		}

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findFirst({
				where: { id: message.chatId, ownerId: userId }
			})
			if (channel) return true
		}

		throw new ForbiddenException('You cannot delete this message')
	}
}

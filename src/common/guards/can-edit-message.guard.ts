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
export class CanEditMessageGuard implements CanActivate {
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

		if (message.senderId !== userId) {
			throw new ForbiddenException('You can only edit your own messages')
		}

		const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
		if (message.sendTime < twentyFourHoursAgo) {
			throw new ForbiddenException('Cannot edit messages older than 24 hours')
		}

		return true
	}
}

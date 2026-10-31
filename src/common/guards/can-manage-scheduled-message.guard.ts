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

@Injectable()
export class CanManageScheduledMessageGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const userId: UserId = request.user.id
		const messageId = parseInt(request.params[PARAMS.MESSAGE_ID])
		const rawChatId = request.params[PARAMS.CHAT_ID]

		if (isNaN(messageId)) {
			throw new NotFoundException('Scheduled message not found')
		}

		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: { senderId: true, chatId: true, scheduledAt: true }
		})

		if (!message || message.scheduledAt === null) {
			throw new NotFoundException('Scheduled message not found')
		}

		if (rawChatId != null && BigInt(rawChatId) !== BigInt(message.chatId)) {
			throw new NotFoundException('Scheduled message not found')
		}

		if (BigInt(message.senderId) !== BigInt(userId)) {
			throw new ForbiddenException('Only the sender can manage a scheduled message')
		}

		return true
	}
}

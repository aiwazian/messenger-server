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

/**
 * Кто и когда может править сообщение.
 *
 * Только своё и только не пересланное: пересланное — копия чужого текста, и
 * запрет живёт на сервере, а не только в меню клиента.
 *
 * Срок правки — сутки, но в «Избранном» он не считается вовсе. Это личные
 * заметки: чат виден одному владельцу, подменить смысл задним числом не перед
 * кем, поэтому текст правится и через год. В «Избранном» лежит и пересылка, и
 * её по-прежнему править нельзя — проверка выше срабатывает раньше.
 */
@Injectable()
export class CanEditMessageGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) { }

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

		if (message.forwardedFromChatId !== null) {
			throw new ForbiddenException('Cannot edit forwarded messages')
		}

		if (message.chatId === userId) {
			return true
		}

		const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
		if (message.sendTime < twentyFourHoursAgo) {
			throw new ForbiddenException('Cannot edit messages older than 24 hours')
		}

		return true
	}
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ChatType } from '../enums/chat-type.enum'
import { ChatId } from '../types/chat-id.type'
import { UserId } from '../types/user-id.type'
import { PARAMS } from '../constants/param.constants'
import { detectChatType } from '../utils/detect-chat-type.util'
import { PrismaService } from '../../providers/prisma/prisma.service'

@Injectable()
export class CanSendMessageGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) { }

	async canActivate(ctx: ExecutionContext): Promise<boolean> {
		const request = ctx.switchToHttp().getRequest()

		const chatId: ChatId = request.params[PARAMS.CHAT_ID]
		const userId: UserId = request.user.id

		const chatType = detectChatType(chatId)

		if (chatType === ChatType.PRIVATE) {
			return true
		}

		if (chatType === ChatType.GROUP) {
			const member = await this.prisma.groupMember.findFirst({
				where: {
					groupId: chatId,
					userId: userId
				}
			})

			if (!member) {
				throw new ForbiddenException('User is not a group member')
			}

			return true
		}

		if (chatType === ChatType.CHANNEL) {
			const admin = await this.prisma.channel.findFirst({
				where: {
					id: chatId,
					ownerId: userId
				}
			})

			if (!admin) {
				throw new ForbiddenException('Only channel admins can write')
			}

			return true
		}

		return false
	}
}

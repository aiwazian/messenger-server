import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ChatId } from '../types/chat-id.type'
import { UserId } from '../types/user-id.type'
import { PARAMS } from '../constants/param.constants'
import { ChatsService } from 'src/modules/chats/chats.service'

@Injectable()
export class CanReadChatGuard implements CanActivate {
    constructor(private readonly chatsService: ChatsService) { }

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const request = ctx.switchToHttp().getRequest()
        const userId: UserId = request.user.id

        const chatId = (request.params[PARAMS.CHAT_ID] || request.params[PARAMS.GROUP_ID] || request.params[PARAMS.CHANNEL_ID]) as ChatId | undefined
        const messageId = request.params[PARAMS.MESSAGE_ID] ? Number(request.params[PARAMS.MESSAGE_ID]) : undefined

        if (messageId !== undefined) {
            return this.chatsService.canReadMessage(userId, messageId, chatId)
        }

        if (chatId !== undefined) {
            return this.chatsService.canReadChat(userId, chatId)
        }

        throw new ForbiddenException('Chat is not specified')
    }
}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ChatsService } from './chats.service'
import { CurrentUserId } from 'src/common/decorators/user-id.decorator'
import { UserId } from 'src/common/types/user-id.type'
import { AuthGuard } from 'src/common/guards/auth.guard'
import { InviteLinksService } from './invite-links.service'
import { CreateInviteLinkDto } from './dto/create-invite-link.dto'
import { plainToInstance } from 'class-transformer'
import { InviteLinkResponseDto } from './dto/invite-link-response.dto'
import { ChatId } from 'src/common/types/chat-id.type'
import { CanReadChatGuard } from 'src/common/guards/can-read-chat.guard'

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatsController {
    constructor(
        private readonly chatsService: ChatsService,
        private readonly inviteLinksService: InviteLinksService
    ) { }

    @Get()
    getAll(@CurrentUserId() userId: UserId) {
        return this.chatsService.getAll(userId)
    }

    @Get(':chatId')
    @UseGuards(CanReadChatGuard)
    getById(
        @CurrentUserId() userId: UserId,
        @Param('chatId') chatId: string
    ) {
        return this.chatsService.getById(userId, ChatId(chatId))
    }

    @Post('invite-links')
    async createInviteLink(
        @CurrentUserId() userId: UserId,
        @Body() dto: CreateInviteLinkDto
    ) {
        const link = await this.inviteLinksService.create(userId, dto)
        return plainToInstance(InviteLinkResponseDto, link)
    }

    @Get('join/:code')
    joinViaLink(
        @CurrentUserId() userId: UserId,
        @Param('code') code: string
    ) {
        return this.inviteLinksService.join(userId, code)
    }
}

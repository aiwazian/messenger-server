import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	UseGuards,
	NotFoundException
} from '@nestjs/common'
import { InviteLinksService } from '../chats/invite-links.service'
import { AuthGuard } from 'src/common/guards/auth.guard'
import { CurrentUserId } from 'src/common/decorators/user-id.decorator'
import { UserId } from 'src/common/types/user-id.type'
import { CreateInviteLinkDto } from '../chats/dto/create-invite-link.dto'
import { plainToInstance } from 'class-transformer'
import { InviteLinkResponseDto } from '../chats/dto/invite-link-response.dto'
import { ParseChannelIdPipe } from 'src/common/pipes/parse-channel-id.pipe'
import { ParseBigIntPipe } from 'src/common/pipes/parse-bigint.pipe'
import { ChannelId } from 'src/common/types/channel-id.type'
import { ChannelOwnerGuard } from 'src/common/guards/channel-owner.guard'
import { ChannelExistsGuard } from 'src/common/guards/channel-exists.guard'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { PARAMS } from 'src/common/constants/param.constants'

@Controller('channels')
@UseGuards(AuthGuard)
export class ChannelInviteLinksController {
	constructor(
		private readonly inviteLinksService: InviteLinksService,
		private readonly prisma: PrismaService
	) {}

	@Get(`:${PARAMS.CHANNEL_ID}/invite-links`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	async getInviteLinks(@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId) {
		const conversation = await this.prisma.conversation.findUnique({
			where: { channelId: BigInt(id) }
		})
		if (!conversation) throw new NotFoundException('Channel conversation not found')

		const links = await this.inviteLinksService.getByConversation(conversation.id)
		const domain = this.inviteLinksService.getShortUrlDomain()

		const mappedLinks = links.map((link) => ({
			...link,
			chatId: id.toString(),
			link: `https://${domain}/+${link.code}`
		}))

		return plainToInstance(InviteLinkResponseDto, mappedLinks)
	}

	@Post(`:${PARAMS.CHANNEL_ID}/invite-links`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	async createInviteLink(
		@CurrentUserId() userId: UserId,
		@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId,
		@Body() dto: CreateInviteLinkDto
	) {
		dto.channelId = id.toString()
		const link = await this.inviteLinksService.create(userId, dto)
		return plainToInstance(InviteLinkResponseDto, link)
	}

	@Delete(`:${PARAMS.CHANNEL_ID}/invite-links/:inviteLinkId`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	async deleteInviteLink(@Param('inviteLinkId', ParseBigIntPipe) inviteLinkId: bigint) {
		await this.inviteLinksService.delete(inviteLinkId)
	}
}

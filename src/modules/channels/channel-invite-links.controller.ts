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
import { CreateInviteLinkDto } from '../chats/dto/create-invite-link.dto'
import { plainToInstance } from 'class-transformer'
import { InviteLinkResponseDto } from '../chats/dto/invite-link-response.dto'
import { AuthGuard } from '../../common/guards/auth.guard'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { ChannelOwnerGuard } from '../../common/guards/channel-owner.guard'
import { ChannelExistsGuard } from '../../common/guards/channel-exists.guard'
import { PARAMS } from '../../common/constants/param.constants'
import { ParseChannelIdPipe } from '../../common/pipes/parse-channel-id.pipe'
import { ChannelId } from '../../common/types/channel-id.type'
import { UserId } from '../../common/types/user-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe'

@Controller('channels')
@UseGuards(AuthGuard)
export class ChannelInviteLinksController {
	constructor(
		private readonly inviteLinksService: InviteLinksService,
		private readonly prisma: PrismaService
	) { }

	@Get(`:${PARAMS.CHANNEL_ID}/invite-links`)
	@UseGuards(ChannelExistsGuard, ChannelOwnerGuard)
	async getInviteLinks(@Param(PARAMS.CHANNEL_ID, ParseChannelIdPipe) id: ChannelId) {
		const links = await this.inviteLinksService.getByChatId(BigInt(id))
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

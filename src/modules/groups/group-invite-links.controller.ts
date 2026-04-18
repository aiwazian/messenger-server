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
import { GroupExistsGuard } from '../../common/guards/group-exists.guard'
import { PARAMS } from '../../common/constants/param.constants'
import { GroupOwnerGuard } from '../../common/guards/group-owner.guard'
import { ParseGroupIdPipe } from '../../common/pipes/parse-group-id.pipe'
import { GroupId } from '../../common/types/group-id.type'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { UserId } from '../../common/types/user-id.type'
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe'

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupInviteLinksController {
	constructor(
		private readonly inviteLinksService: InviteLinksService,
		private readonly prisma: PrismaService
	) { }

	@Get(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	async getInviteLinks(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId) {
		const links = await this.inviteLinksService.getByChatId(BigInt(id))
		const domain = this.inviteLinksService.getShortUrlDomain()

		const mappedLinks = links.map((link: any) => ({
			...link,
			chatId: id.toString(),
			link: `https://${domain}/+${link.code}`
		}))

		return plainToInstance(InviteLinkResponseDto, mappedLinks)
	}

	@Post(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	async createInviteLink(
		@CurrentUserId() userId: UserId,
		@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId,
		@Body() dto: CreateInviteLinkDto
	) {
		dto.chatId = Number(id)
		return await this.inviteLinksService.create(userId, dto)
	}

	@Delete(`:${PARAMS.GROUP_ID}/invite-links/:inviteLinkId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	async deleteInviteLink(@Param('inviteLinkId', ParseBigIntPipe) inviteLinkId: bigint) {
		await this.inviteLinksService.delete(inviteLinkId)
	}
}

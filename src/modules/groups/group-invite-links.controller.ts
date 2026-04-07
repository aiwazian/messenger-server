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
import { ParseGroupIdPipe } from 'src/common/pipes/parse-group-id.pipe'
import { ParseBigIntPipe } from 'src/common/pipes/parse-bigint.pipe'
import { GroupId } from 'src/common/types/group-id.type'
import { GroupOwnerGuard } from 'src/common/guards/group-owner.guard'
import { GroupExistsGuard } from 'src/common/guards/group-exists.guard'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { PARAMS } from 'src/common/constants/param.constants'

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupInviteLinksController {
	constructor(
		private readonly inviteLinksService: InviteLinksService,
		private readonly prisma: PrismaService
	) {}

	@Get(`:${PARAMS.GROUP_ID}/invite-links`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	async getInviteLinks(@Param(PARAMS.GROUP_ID, ParseGroupIdPipe) id: GroupId) {
		const conversation = await this.prisma.conversation.findUnique({
			where: { groupId: BigInt(id) }
		})
		if (!conversation) throw new NotFoundException('Group conversation not found')

		const links = await this.inviteLinksService.getByConversation(conversation.id)
		const domain = this.inviteLinksService.getShortUrlDomain()

		const mappedLinks = links.map((link) => ({
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
		dto.groupId = id.toString()
		const link = await this.inviteLinksService.create(userId, dto)
		return plainToInstance(InviteLinkResponseDto, link)
	}

	@Delete(`:${PARAMS.GROUP_ID}/invite-links/:inviteLinkId`)
	@UseGuards(GroupExistsGuard, GroupOwnerGuard)
	async deleteInviteLink(@Param('inviteLinkId', ParseBigIntPipe) inviteLinkId: bigint) {
		await this.inviteLinksService.delete(inviteLinkId)
	}
}

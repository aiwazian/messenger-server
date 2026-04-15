import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { ChannelId } from '../types/channel-id.type'
import { PARAMS } from '../constants/param.constants'
import { ChannelsService } from '../../modules/channels/channels.service'

@Injectable()
export class ChannelExistsGuard implements CanActivate {
	constructor(private readonly channelsService: ChannelsService) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const channelId: ChannelId = request.params[PARAMS.CHANNEL_ID]

		const channel = await this.channelsService.isExists(channelId)
		if (!channel) {
			throw new NotFoundException('Channel not found')
		}

		return true
	}
}

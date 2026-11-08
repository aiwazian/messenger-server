import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { ChannelId } from '../types/channel-id.type'
import { PARAMS } from '../constants/param.constants'
import { ChannelsService } from '../../modules/channels/channels.service'

const NUMERIC_ID_PATTERN = /^\d{1,19}$/

@Injectable()
export class ChannelExistsGuard implements CanActivate {
	constructor(private readonly channelsService: ChannelsService) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const rawChannelId: string = request.params[PARAMS.CHANNEL_ID]

		if (!NUMERIC_ID_PATTERN.test(rawChannelId)) {
			throw new NotFoundException('Channel not found')
		}

		const channel = await this.channelsService.isExists(ChannelId(rawChannelId))
		if (!channel) {
			throw new NotFoundException('Channel not found')
		}

		return true
	}
}

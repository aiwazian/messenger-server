import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { ChannelsService } from 'src/modules/channels/channels.service'
import { PARAMS } from '../constants/param.constants'

@Injectable()
export class ChannelOwnerGuard implements CanActivate {
    constructor(private readonly channelsService: ChannelsService) { }

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest()
        const user = request.user
        const channelId = request.params[PARAMS.CHANNEL_ID]

        const isOwner = await this.channelsService.isOwner(channelId, user.id)
        if (!isOwner) {
            throw new ForbiddenException('User is not the owner of the channel')
        }

        return true
    }
}

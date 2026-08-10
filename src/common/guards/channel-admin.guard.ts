import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PARAMS } from '../constants/param.constants'
import { ChannelId } from '../types/channel-id.type'
import { UserId } from '../types/user-id.type'
import { ADMIN_PERMISSION_KEY, AdminPermission } from '../decorators/admin-permission.decorator'
import { ChannelAdminsService } from '../../modules/channels/channel-admins.service'

/**
 * Пропускает владельца канала и администраторов с нужным правом.
 *
 * Требуемое право указывается декоратором RequireAdminPermission на методе
 * контроллера. Без декоратора достаточно быть владельцем или администратором.
 */
@Injectable()
export class ChannelAdminGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly channelAdminsService: ChannelAdminsService
	) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const channelId = ChannelId(request.params[PARAMS.CHANNEL_ID])

		const permission = this.reflector.getAllAndOverride<AdminPermission | undefined>(
			ADMIN_PERMISSION_KEY,
			[context.getHandler(), context.getClass()]
		)

		const allowed = await this.channelAdminsService.hasPermission(
			channelId,
			UserId(user.id),
			permission
		)

		if (!allowed) {
			throw new ForbiddenException('Not enough permissions in the channel')
		}

		return true
	}
}

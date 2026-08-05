import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PARAMS } from '../constants/param.constants'
import { GroupId } from '../types/group-id.type'
import { UserId } from '../types/user-id.type'
import {
	ADMIN_PERMISSION_KEY,
	AdminPermission
} from '../decorators/admin-permission.decorator'
import { GroupAdminsService } from '../../modules/groups/group-admins.service'

/**
 * Пропускает владельца группы и администраторов с нужным правом.
 *
 * Требуемое право указывается декоратором RequireAdminPermission на методе
 * контроллера. Без декоратора достаточно быть владельцем или администратором.
 */
@Injectable()
export class GroupAdminGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly groupAdminsService: GroupAdminsService
	) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const groupId = GroupId(request.params[PARAMS.GROUP_ID])

		const permission = this.reflector.getAllAndOverride<AdminPermission | undefined>(
			ADMIN_PERMISSION_KEY,
			[context.getHandler(), context.getClass()]
		)

		const allowed = await this.groupAdminsService.hasPermission(
			groupId,
			UserId(user.id),
			permission
		)

		if (!allowed) {
			throw new ForbiddenException('Not enough permissions in the group')
		}

		return true
	}
}

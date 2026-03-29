import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { GroupsService } from 'src/modules/groups/groups.service'
import { PARAMS } from '../constants/param.constants'

@Injectable()
export class GroupOwnerGuard implements CanActivate {
	constructor(private readonly groupsService: GroupsService) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const groupId = request.params[PARAMS.GROUP_ID]

		const isOwner = await this.groupsService.isOwner(groupId, user.id)
		if (!isOwner) {
			throw new ForbiddenException('User is not the owner of the channel')
		}

		return true
	}
}

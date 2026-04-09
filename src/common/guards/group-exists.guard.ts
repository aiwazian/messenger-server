import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { GroupId } from '../types/group-id.type'
import { PARAMS } from '../constants/param.constants'
import { GroupsService } from '../../modules/groups/groups.service'

@Injectable()
export class GroupExistsGuard implements CanActivate {
	constructor(private readonly groupsService: GroupsService) { }

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const groupId: GroupId = request.params[PARAMS.GROUP_ID]

		const group = await this.groupsService.isExists(groupId)
		if (!group) {
			throw new NotFoundException('Group not found')
		}

		return true
	}
}

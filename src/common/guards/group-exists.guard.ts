import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { GroupId } from '../types/group-id.type'
import { PARAMS } from '../constants/param.constants'
import { GroupsService } from '../../modules/groups/groups.service'

const NUMERIC_ID_PATTERN = /^\d{1,19}$/

@Injectable()
export class GroupExistsGuard implements CanActivate {
	constructor(private readonly groupsService: GroupsService) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const rawGroupId: string = request.params[PARAMS.GROUP_ID]

		if (!NUMERIC_ID_PATTERN.test(rawGroupId)) {
			throw new NotFoundException('Group not found')
		}

		const group = await this.groupsService.isExists(GroupId(rawGroupId))
		if (!group) {
			throw new NotFoundException('Group not found')
		}

		return true
	}
}

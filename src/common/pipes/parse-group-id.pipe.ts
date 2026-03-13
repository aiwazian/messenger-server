import { PipeTransform, BadRequestException } from '@nestjs/common'
import { MAX_INT64 } from '../constants/db.constants'
import { GroupId } from '../types/group-id.type'

export class ParseGroupIdPipe implements PipeTransform<string, GroupId> {
	transform(value: string): GroupId {
		let id: GroupId

		try {
			id = GroupId(value)
		} catch {
			throw new BadRequestException('Invalid group id')
		}

		if (id > MAX_INT64) {
			throw new BadRequestException('Id is too large')
		}

		return id
	}
}

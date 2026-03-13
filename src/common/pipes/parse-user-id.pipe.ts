import { PipeTransform, BadRequestException } from '@nestjs/common'
import { MAX_INT64 } from '../constants/db.constants'
import { UserId } from '../types/user-id.type'

export class ParseUserIdPipe implements PipeTransform<string, UserId> {
	transform(value: string): UserId {
		let id: UserId

		try {
			id = UserId(value)
		} catch {
			throw new BadRequestException('Invalid user id')
		}

		if (id > MAX_INT64) {
			throw new BadRequestException('Id is too large')
		}

		return id
	}
}

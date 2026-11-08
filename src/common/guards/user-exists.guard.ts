import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { PARAMS } from '../constants/param.constants'
import { UserId } from '../types/user-id.type'
import { UsersService } from '../../modules/users/users.service'

const NUMERIC_ID_PATTERN = /^\d{1,19}$/

@Injectable()
export class UserExistsGuard implements CanActivate {
	constructor(private readonly usersService: UsersService) {}

	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const rawUserId: string = request.params[PARAMS.USER_ID]

		if (!NUMERIC_ID_PATTERN.test(rawUserId)) {
			throw new NotFoundException('User not found')
		}

		const user = await this.usersService.isExists(UserId(rawUserId))
		if (!user) {
			throw new NotFoundException('User not found')
		}

		return true
	}
}

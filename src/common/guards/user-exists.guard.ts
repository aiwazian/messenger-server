import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { PARAMS } from '../constants/param.constants'
import { UsersService } from 'src/modules/users/users.service'
import { UserId } from '../types/user-id.type'

@Injectable()
export class UserExistsGuard implements CanActivate {
    constructor(private readonly usersService: UsersService) { }

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest()
        const userId: UserId = request.params[PARAMS.USER_ID]

        const user = await this.usersService.isExists(userId)
        if (!user) {
            throw new NotFoundException('User not found')
        }

        return true
    }
}

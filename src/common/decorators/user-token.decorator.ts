import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const CurrentUserToken = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest()
        const authHeader = request.headers['authorization'] || ''
        const token = authHeader.replace(/^Bearer\s+/i, '')
        return token
    }
)

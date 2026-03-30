import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const CurrentSession = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
	const request = ctx.switchToHttp().getRequest()
	if (!request.user || !request.user.session) {
		throw new Error('Session not found in request')
	}
	return request.user.session
})

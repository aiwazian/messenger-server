import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	private readonly logger = new Logger(AllExceptionsFilter.name)

	constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

	catch(exception: unknown, host: ArgumentsHost): void {
		const { httpAdapter } = this.httpAdapterHost
		const ctx = host.switchToHttp()

		if (host.getType() !== 'http') {
			this.logger.error(
				`Unhandled exception in ${host.getType()}:`,
				exception instanceof Error ? exception.stack : String(exception)
			)
			return
		}

		const isHttpException = exception instanceof HttpException
		const httpStatus = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

		const request = ctx.getRequest()
		const path = httpAdapter.getRequestUrl(request)

		let clientMessage: string | string[] = 'Unhandled exception'
		if (isHttpException) {
			const response = exception.getResponse()
			if (typeof response === 'string') {
				clientMessage = response
			} else if (typeof response === 'object' && response !== null) {
				const r = response as Record<string, unknown>
				if (typeof r.message === 'string') {
					clientMessage = r.message
				} else if (Array.isArray(r.message)) {
					clientMessage = r.message as string[]
				}
			}
		}

		if (isHttpException) {
			this.logger.warn(`${httpStatus} ${path} — ${this.stringifyForLog(clientMessage)}`)
		} else {
			this.logger.error(
				`Unhandled ${httpStatus} on ${path}`,
				exception instanceof Error ? exception.stack : String(exception)
			)
		}

		httpAdapter.reply(
			ctx.getResponse(),
			{
				statusCode: httpStatus,
				timestamp: new Date().toISOString(),
				path,
				message: clientMessage
			},
			httpStatus
		)
	}

	private stringifyForLog(value: string | string[]): string {
		if (Array.isArray(value)) return JSON.stringify(value)
		return value
	}
}

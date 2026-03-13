import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    constructor(private readonly httpAdapterHost: HttpAdapterHost) { }

    catch(exception: unknown, host: ArgumentsHost): void {
        const { httpAdapter } = this.httpAdapterHost;
        const ctx = host.switchToHttp();

        if (host.getType() !== 'http') {
            this.logger.error(`Unhandled exception in ${host.getType()}:`, exception);
            return;
        }

        const httpStatus =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const responseBody = {
            statusCode: httpStatus,
            timestamp: new Date().toISOString(),
            path: httpAdapter.getRequestUrl(ctx.getRequest()),
            message: exception instanceof Error ? exception.message : 'Internal server error',
        };

        this.logger.error(
            `Unhandled Exception: ${JSON.stringify(responseBody)}`,
            exception instanceof Error ? exception.stack : ''
        );

        httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
    }
}

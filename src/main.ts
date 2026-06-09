import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app.module'
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BigIntInterceptor } from './common/interceptors/big-int.interceptor'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import helmet from 'helmet'

async function bootstrap() {
	const logger = new Logger('Bootstrap')
	const app = await NestFactory.create(AppModule)
	const configService = app.get(ConfigService)
	const httpAdapter = app.get(HttpAdapterHost)

	app.use(helmet())
	app.setGlobalPrefix('api')
	app.useGlobalInterceptors(new BigIntInterceptor())
	app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))
	app.useGlobalFilters(new AllExceptionsFilter(httpAdapter))
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: {
				enableImplicitConversion: true
			}
		})
	)

	process.on('uncaughtException', (err) => {
		logger.error(`Critical Uncaught Exception: ${err.message}`, err.stack)
	})

	process.on('unhandledRejection', (reason, promise) => {
		logger.error(`Unhandled Rejection: ${reason instanceof Error ? reason.message : reason}`)
	})

	const port = configService.get<number>('SERVER_PORT')!
	await app.listen(port)
}
bootstrap()

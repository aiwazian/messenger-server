import { Module } from '@nestjs/common'
import { SessionsModule } from '../sessions/sessions.module'
import { RestoreCredentialsController } from './restore-credentials.controller'
import { RestoreCredentialsService } from './restore-credentials.service'

@Module({
	imports: [SessionsModule],
	controllers: [RestoreCredentialsController],
	providers: [RestoreCredentialsService]
})
export class RestoreCredentialsModule {}

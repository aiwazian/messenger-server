import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { EmailVerificationStore } from '../users/email-verification.store'
import { MailModule } from '../mail/mail.module'

@Module({
	imports: [SessionsModule, MailModule],
	controllers: [AuthController],
	providers: [AuthService, EmailVerificationStore]
})
export class AuthModule {}

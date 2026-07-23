import { Module } from '@nestjs/common'
import { MailService } from './mail.service'
import { SmtpProvider } from './providers/smtp.provider'

@Module({
	providers: [MailService, SmtpProvider],
	exports: [MailService]
})
export class MailModule {}

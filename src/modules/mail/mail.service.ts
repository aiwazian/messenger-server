import { Injectable } from '@nestjs/common'
import * as ejs from 'ejs'
import * as path from 'path'
import { SmtpProvider } from './providers/smtp.provider'

@Injectable()
export class MailService {
	private readonly templatesDir = path.join(__dirname, 'templates')

	constructor(private readonly smtp: SmtpProvider) {}

	async sendVerifyEmail(email: string, code: string): Promise<void> {
		const html = await ejs.renderFile(
			path.join(this.templatesDir, 'verify-email.ejs'),
			{ code },
			{ cache: true, filename: 'verify-email' }
		)

		await this.smtp.sendMail({
			to: email,
			subject: 'Подтверждение электронной почты',
			html: html
		})
	}

	async sendPasswordResetEmail(email: string, code: string): Promise<void> {
		const html = await ejs.renderFile(
			path.join(this.templatesDir, 'password-reset.ejs'),
			{ code },
			{ cache: true, filename: 'password-reset' }
		)

		await this.smtp.sendMail({
			to: email,
			subject: 'Сброс пароля',
			html: html
		})
	}
}

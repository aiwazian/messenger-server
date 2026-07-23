import { Injectable, Logger } from '@nestjs/common'
import { Transporter, createTransport } from 'nodemailer'
import { ConfigService } from '@nestjs/config'

export interface SendMailOptions {
	to: string
	subject: string
	html: string
}

@Injectable()
export class SmtpProvider {
	private readonly logger = new Logger(SmtpProvider.name)
	private readonly transporter: Transporter

	constructor(private readonly config: ConfigService) {
		this.transporter = createTransport({
			host: this.config.get<string>('SMTP_HOST'),
			port: this.config.get<number>('SMTP_PORT'),
			secure: this.config.get<boolean>('SMTP_SECURE', true),
			auth: {
				user: this.config.get<string>('SMTP_USER'),
				pass: this.config.get<string>('SMTP_PASS')
			}
		})
	}

	async sendMail(options: SendMailOptions): Promise<void> {
		const from = this.config.get<string>('SMTP_FROM')

		await this.transporter.sendMail({
			from,
			to: options.to,
			subject: options.subject,
			html: options.html
		})

		this.logger.debug(`Email sent to ${options.to}`)
	}
}

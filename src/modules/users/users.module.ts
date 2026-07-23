import { Module, forwardRef } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { StorageModule } from '../storage/storage.module'
import { JwtAuthModule } from '../security/jwt.module'
import { EmailVerificationStore } from './email-verification.store'
import { MailModule } from '../mail/mail.module'

@Module({
	imports: [
		JwtAuthModule,
		SessionsModule,
		SearchModule,
		forwardRef(() => StorageModule),
		MailModule
	],
	controllers: [UsersController],
	providers: [UsersService, EmailVerificationStore],
	exports: [UsersService]
})
export class UsersModule {}

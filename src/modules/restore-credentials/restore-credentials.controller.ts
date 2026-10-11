import { Body, Controller, Get, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/server'
import { Public } from '../../common/decorators/public.decorator'
import { CurrentUserToken } from '../../common/decorators/user-token.decorator'
import { RestoreCredentialsService } from './restore-credentials.service'
import { RestoreRegistrationRequestDto } from './dto/restore-registration-request.dto'
import { RestoreAuthenticationRequestDto } from './dto/restore-authentication-request.dto'

@Controller('auth/restore')
export class RestoreCredentialsController {
	constructor(private readonly restoreCredentialsService: RestoreCredentialsService) {}

	@Get('register-options')
	getRegistrationOptions(
		@CurrentUserToken() token: string
	): Promise<{ options: PublicKeyCredentialCreationOptionsJSON }> {
		return this.restoreCredentialsService.getRegistrationOptions(token)
	}

	@Post('register')
	register(@CurrentUserToken() token: string, @Body() dto: RestoreRegistrationRequestDto) {
		return this.restoreCredentialsService.register(token, dto)
	}

	@Get('authentication-options')
	@Public()
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	getAuthenticationOptions(): Promise<{ options: PublicKeyCredentialRequestOptionsJSON }> {
		return this.restoreCredentialsService.getAuthenticationOptions()
	}

	@Post('authentication')
	@Public()
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	authenticate(@Body() dto: RestoreAuthenticationRequestDto) {
		return this.restoreCredentialsService.authenticate(dto)
	}
}

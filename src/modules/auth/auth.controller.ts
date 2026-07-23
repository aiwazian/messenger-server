import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { SigninDto } from './dto/signin.dto'
import { SessionsService } from '../sessions/sessions.service'
import { SignupDto } from './dto/signup.dto'
import { CurrentUserToken } from '../../common/decorators/user-token.decorator'
import { Throttle } from '@nestjs/throttler'
import { Public } from '../../common/decorators/public.decorator'
import { RequestPasswordResetDto } from './dto/request-password-reset.dto'
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly sessionService: SessionsService
	) {}

	@Get('check/:login')
	@Public()
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	isLoginAvailable(@Param('login') login: string) {
		return this.authService.isLoginAvailable(login)
	}

	@Post('signin')
	@Public()
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	signin(@Body() dto: SigninDto) {
		return this.authService.signin(dto)
	}

	@Post('signup')
	@Public()
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	signup(@Body() dto: SignupDto) {
		return this.authService.signup(dto)
	}

	@Post('logout')
	logout(@CurrentUserToken() token: string) {
		return this.sessionService.deleteByToken(token)
	}

	@Post('password-reset/request')
	@Public()
	@Throttle({ default: { limit: 5, ttl: 60000 } })
	requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
		return this.authService.requestPasswordReset(dto)
	}

	@Post('password-reset/verify')
	@Public()
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	verifyResetCode(@Body() dto: VerifyResetCodeDto) {
		return this.authService.verifyResetCode(dto)
	}

	@Post('password-reset/confirm')
	@Public()
	@Throttle({ default: { limit: 5, ttl: 60000 } })
	resetPassword(@Body() dto: ResetPasswordDto) {
		return this.authService.resetPassword(dto)
	}
}

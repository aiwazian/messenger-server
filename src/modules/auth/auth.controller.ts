import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { SigninDto } from './dto/signin.dto'
import { SessionsService } from '../sessions/sessions.service'
import { SignupDto } from './dto/signup.dto'
import { AuthGuard } from '../../common/guards/auth.guard'
import { CurrentUserToken } from '../../common/decorators/user-token.decorator'
import { Throttle } from '@nestjs/throttler'

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly sessionService: SessionsService
	) { }

	@Get('check/:login')
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	isLoginAvailable(@Param('login') login: string) {
		return this.authService.isLoginAvailable(login)
	}

	@Post('signin')
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	signin(@Body() dto: SigninDto) {
		return this.authService.signin(dto)
	}

	@Post('signup')
	@Throttle({ default: { limit: 10, ttl: 60000 } })
	signup(@Body() dto: SignupDto) {
		return this.authService.signup(dto)
	}

	@Post('logout')
	@UseGuards(AuthGuard)
	logout(@CurrentUserToken() token: string) {
		return this.sessionService.deleteByToken(token)
	}
}

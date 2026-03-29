import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { SigninDto } from './dto/signin.dto'
import { SessionsService } from '../sessions/sessions.service'
import { AuthGuard } from 'src/common/guards/auth.guard'
import { SignupDto } from './dto/signup.dto'
import { CurrentUserId } from 'src/common/decorators/user-id.decorator'
import { UserId } from 'src/common/types/user-id.type'
import { CurrentUserToken } from 'src/common/decorators/user-token.decorator'
import { SessionOwnerGuard } from 'src/common/guards/session-owner.guard'
import { ThrottlerGuard } from '@nestjs/throttler'

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly sessionService: SessionsService
	) {}

	@Get('check/:login')
	isLoginAvailable(@Param('login') login: string) {
		return this.authService.isLoginAvailable(login)
	}

	@Post('signin')
	signin(@Body() dto: SigninDto) {
		return this.authService.signin(dto)
	}

	@Post('signup')
	signup(@Body() dto: SignupDto) {
		return this.authService.signup(dto)
	}

	@Post('logout')
	@UseGuards(AuthGuard, SessionOwnerGuard)
	logout(@CurrentUserToken() token: string) {
		return this.sessionService.deleteByToken(token)
	}
}

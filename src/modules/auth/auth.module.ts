import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { JwtAuthModule } from '../security/jwt.module'

@Module({
	imports: [JwtAuthModule, SessionsModule],
	controllers: [AuthController],
	providers: [AuthService]
})
export class AuthModule {}

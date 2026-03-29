import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtAuthModule } from 'src/modules/security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'

@Module({
	imports: [JwtAuthModule, SessionsModule],
	controllers: [AuthController],
	providers: [AuthService]
})
export class AuthModule {}

import { Module } from '@nestjs/common'
import { StorageService } from './storage.service'
import { SessionsModule } from '../sessions/sessions.module'
import { JwtAuthModule } from '../security/jwt.module'

@Module({
	imports: [SessionsModule, JwtAuthModule],
	providers: [StorageService],
	exports: [StorageService]
})
export class StorageModule {}

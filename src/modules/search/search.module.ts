import { Module } from '@nestjs/common'
import { SearchService } from './search.service'
import { SearchController } from './search.controller'
import { JwtAuthModule } from '../security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'

@Module({
	imports: [JwtAuthModule, SessionsModule],
	controllers: [SearchController],
	providers: [SearchService],
	exports: [SearchService]
})
export class SearchModule {}

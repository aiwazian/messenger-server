import { Module } from '@nestjs/common'
import { SearchService } from './search.service'
import { SearchController } from './search.controller'
import { JwtAuthModule } from '../security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { ContentModerationService } from '../security/content-moderation.service'

@Module({
	imports: [JwtAuthModule, SessionsModule],
	controllers: [SearchController],
	providers: [SearchService, ContentModerationService],
	exports: [SearchService]
})
export class SearchModule {}

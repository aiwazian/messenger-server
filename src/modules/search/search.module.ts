import { Module } from '@nestjs/common'
import { SearchService } from './search.service'
import { SearchController } from './search.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { ContentModerationService } from '../security/content-moderation.service'

@Module({
	imports: [SessionsModule],
	controllers: [SearchController],
	providers: [SearchService, ContentModerationService],
	exports: [SearchService]
})
export class SearchModule {}

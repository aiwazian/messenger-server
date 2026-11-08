import { Controller, Get, Param, Query } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { SearchService } from './search.service'
import { SearchQueryDto } from './dto/search-query.dto'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'

@Controller('search')
export class SearchController {
	constructor(private readonly searchService: SearchService) {}

	@Get('check/:username')
	@Throttle({ default: { limit: 15, ttl: 60000 } })
	isUsernameAvailable(@Param('username') username: string, @CurrentUserId() userId: bigint) {
		return this.searchService.isUsernameAvailable(username, userId)
	}

	@Get('resolve/:username')
	resolveUsername(@Param('username') username: string, @CurrentUserId() userId: bigint) {
		return this.searchService.resolveUsername(username, userId)
	}

	@Get()
	search(@Query() query: SearchQueryDto, @CurrentUserId() userId: bigint) {
		return this.searchService.search(query, userId)
	}
}

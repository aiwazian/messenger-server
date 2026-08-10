import { Controller, Get, Param, Query } from '@nestjs/common'
import { SearchService } from './search.service'
import { SearchQueryDto } from './dto/search-query.dto'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'

@Controller('search')
export class SearchController {
	constructor(private readonly searchService: SearchService) {}

	@Get('check/:username')
	isUsernameAvailable(@Param('username') username: string) {
		return this.searchService.isUsernameAvailable(username)
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

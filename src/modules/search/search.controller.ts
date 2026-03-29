import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { SearchService } from './search.service'
import { AuthGuard } from 'src/common/guards/auth.guard'
import { SearchQueryDto } from './dto/search-query.dto'
import { CurrentUserId } from 'src/common/decorators/user-id.decorator'

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
	constructor(private readonly searchService: SearchService) {}

	@Get('check/:username')
	async isUsernameAvailable(@Param('username') username: string) {
		const available = await this.searchService.isUsernameAvailable(username)
		return { available }
	}

	@Get()
	search(@Query() query: SearchQueryDto, @CurrentUserId() userId: bigint) {
		return this.searchService.search(query, userId)
	}
}

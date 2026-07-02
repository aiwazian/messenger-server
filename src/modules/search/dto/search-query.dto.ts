import { IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { Trim } from '../../../common/decorators/trim.decorator'

export class SearchQueryDto {
	@IsOptional()
	@IsString()
	@Trim()
	q?: string

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number = 20

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset?: number = 0
}

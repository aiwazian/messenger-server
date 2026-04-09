import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { Trim } from '../../../common/decorators/trim.decorator'

export enum SearchType {
	CHATS = 'chats',
	FILES = 'files'
}

export class SearchQueryDto {
	@IsOptional()
	@IsString()
	@Trim()
	q?: string

	@IsOptional()
	@IsEnum(SearchType)
	type?: SearchType = SearchType.CHATS

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

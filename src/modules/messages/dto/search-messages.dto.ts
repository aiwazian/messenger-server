import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

export class SearchMessagesDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MaxLength(100)
	q: string

	/** Курсор: возвращаются только сообщения с id меньше курсора. */
	@IsOptional()
	@Matches(/^\d+$/, { message: 'cursorId must be a positive integer' })
	cursorId?: string

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(50)
	limit: number = 30
}

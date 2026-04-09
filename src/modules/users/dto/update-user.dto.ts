import { IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

export class UpdateUserDto {
	@IsString()
	@Trim()
	@MinLength(1)
	@MaxLength(32)
	firstName: string

	@IsOptional()
	@IsString()
	@Trim()
	@MaxLength(32)
	lastName?: string

	@IsOptional()
	@IsString()
	@Trim()
	@MaxLength(32)
	@Matches(/^[a-zA-Z0-9_]*$/, {
		message: 'Username can only contain letters, numbers and underscores'
	})
	username?: string | null

	@IsOptional()
	@IsString()
	@Trim()
	@MaxLength(255)
	bio?: string

	@IsOptional()
	@IsNumber()
	dateOfBirth?: number
}

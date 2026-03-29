import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { Trim } from 'src/common/decorators/trim.decorator'

export class AuthCredentialsDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(5)
	@MaxLength(32)
	@Matches(/^\S+$/, {
		message: 'login must not contain spaces'
	})
	login: string

	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(5)
	@MaxLength(32)
	@Matches(/^\S+$/, {
		message: 'password must not contain spaces'
	})
	password: string
}

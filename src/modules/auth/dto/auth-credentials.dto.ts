import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'
import {
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	PASSWORD_REGEX,
	PASSWORD_REGEX_MESSAGE
} from '../../../common/constants/password.constants'

export class AuthCredentialsDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(5)
	@MaxLength(64)
	@Matches(/^\S+$/, {
		message: 'login must not contain spaces'
	})
	login: string

	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(PASSWORD_MIN_LENGTH)
	@MaxLength(PASSWORD_MAX_LENGTH)
	@Matches(PASSWORD_REGEX, {
		message: PASSWORD_REGEX_MESSAGE
	})
	password: string
}

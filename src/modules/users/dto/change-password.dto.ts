import { IsString, MinLength, MaxLength, Matches } from 'class-validator'
import {
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	PASSWORD_REGEX,
	PASSWORD_REGEX_MESSAGE
} from '../../../common/constants/password.constants'

export class ChangePasswordDto {
	@IsString()
	@MinLength(PASSWORD_MIN_LENGTH)
	@MaxLength(PASSWORD_MAX_LENGTH)
	@Matches(PASSWORD_REGEX, {
		message: PASSWORD_REGEX_MESSAGE
	})
	password: string
}

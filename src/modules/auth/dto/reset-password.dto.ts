import {
	IsNotEmpty,
	IsOptional,
	IsString,
	Length,
	Matches,
	MaxLength,
	MinLength
} from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'
import {
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	PASSWORD_REGEX,
	PASSWORD_REGEX_MESSAGE
} from '../../../common/constants/password.constants'

export class ResetPasswordDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(5)
	login: string

	@IsString()
	@Trim()
	@IsNotEmpty()
	@Length(6, 6)
	code: string

	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(PASSWORD_MIN_LENGTH)
	@MaxLength(PASSWORD_MAX_LENGTH)
	@Matches(PASSWORD_REGEX, {
		message: PASSWORD_REGEX_MESSAGE
	})
	newPassword: string

	/*
	 * Сброс пароля выдаёт полноценную сессию, поэтому устройство описывается так
	 * же, как при входе. Поля необязательные: без них сессия появится в списке
	 * без модели устройства, а не с подписью вместо неё.
	 */
	@IsOptional()
	@IsString()
	@Trim()
	@IsNotEmpty()
	deviceModel?: string

	@IsOptional()
	@IsString()
	@Trim()
	@IsNotEmpty()
	osVersion?: string

	@IsOptional()
	@IsString()
	@Trim()
	@IsNotEmpty()
	osName?: string
}

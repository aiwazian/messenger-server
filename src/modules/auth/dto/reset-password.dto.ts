import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

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
	@MinLength(5)
	newPassword: string
}

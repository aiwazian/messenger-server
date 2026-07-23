import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

export class VerifyResetCodeDto {
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
}

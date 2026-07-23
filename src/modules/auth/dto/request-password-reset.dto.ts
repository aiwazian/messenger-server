import { IsNotEmpty, IsString, MinLength } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

export class RequestPasswordResetDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(5)
	login: string
}

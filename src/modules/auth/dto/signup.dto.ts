import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { AuthCredentialsDto } from './auth-credentials.dto'
import { Trim } from '../../../common/decorators/trim.decorator'

export class SignupDto extends AuthCredentialsDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(1)
	@MaxLength(32)
	firstName: string

	@IsOptional()
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MinLength(1)
	@MaxLength(32)
	lastName: string

	@IsString()
	@Trim()
	@IsNotEmpty()
	deviceModel: string

	@IsString()
	@Trim()
	@IsNotEmpty()
	osVersion: string

	@IsString()
	@Trim()
	@IsNotEmpty()
	osName: string
}

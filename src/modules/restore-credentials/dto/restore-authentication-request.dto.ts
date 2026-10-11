import { IsNotEmpty, IsString } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

export class RestoreAuthenticationRequestDto {
	@IsString()
	@IsNotEmpty()
	assertionJson: string

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

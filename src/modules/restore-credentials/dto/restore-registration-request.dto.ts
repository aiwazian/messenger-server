import { IsNotEmpty, IsString } from 'class-validator'

export class RestoreRegistrationRequestDto {
	@IsString()
	@IsNotEmpty()
	registrationJson: string
}

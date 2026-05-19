import { IsString } from 'class-validator'

export class UpdateFcmTokenDto {
	@IsString()
	fcmToken: string
}

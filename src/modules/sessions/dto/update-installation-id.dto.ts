import { IsString } from 'class-validator'

export class UpdateInstallationIdDto {
	@IsString()
	installationId: string
}

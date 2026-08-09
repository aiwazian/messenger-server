import { UserId } from '../../../common/types/user-id.type'

export class CreateSessionDto {
	userId: UserId
	deviceModel: string
	osVersion: string
	osName: string
}

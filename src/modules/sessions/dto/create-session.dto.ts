import { UserId } from 'src/common/types/user-id.type'

export class CreateSessionDto {
    userId: UserId
    token: string
    fcmToken?: string
    deviceModel?: string
    osVersion?: string
    osName?: string
}

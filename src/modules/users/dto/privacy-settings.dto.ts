import { Expose } from 'class-transformer'

export class PrivacySettingsDto {
    @Expose()
    lastSeen: number

    @Expose()
    messages: number

    @Expose()
    bio: number

    @Expose()
    dateOfBirth: number

    @Expose()
    invites: number
}

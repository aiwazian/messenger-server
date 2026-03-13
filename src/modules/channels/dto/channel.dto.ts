import { Exclude, Expose } from 'class-transformer'
import { ChannelType } from 'generated/prisma/enums'
import { OmitNull } from 'src/common/decorators/omit-null.decorator'

@Exclude()
export class ChannelResponseDto {
    @Expose()
    id: string

    @Expose()
    name: string

    @Expose()
    @OmitNull()
    username?: string

    @Expose()
    @OmitNull()
    bio?: string

    @Expose()
    @OmitNull()
    ownerId?: string

    @Expose()
    channelType: ChannelType

    @Expose()
    @OmitNull()
    subscribers: string

    @Expose()
    @OmitNull()
    removedUser?: string

    @Expose()
    isSubscribed: boolean

    @Expose()
    isOwner?: boolean

    @Expose()
    @OmitNull()
    inviteLink?: string
}

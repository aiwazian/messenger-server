import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'
import { ChannelType } from '../../../generated/prisma/enums'

@Exclude()
export class ChannelResponseDto {
	@Expose()
	id: number

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
	removedUsers?: number

	@Expose()
	isSubscribed: boolean

	@Expose()
	isOwner?: boolean

	/** Запрет копирования контента канала. */
	@Expose()
	noCopy: boolean

	@Expose()
	@OmitNull()
	avatars?: { fileId: string }[]
}

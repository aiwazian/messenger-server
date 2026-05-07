import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class InternalInviteLinkResponse {
	@Expose()
	chatId: string

	@Expose()
	name: string

	@Expose()
	@OmitNull()
	description: string

	@Expose()
	@OmitNull()
	membersCount: bigint

	@Expose()
	@OmitNull()
	isBanned: number

	@Expose()
	@OmitNull()
	isJoined: number
}

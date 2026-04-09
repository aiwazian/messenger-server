import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'
import { GroupType } from '../../../../generated/prisma/enums'

@Exclude()
export class GroupResponseDto {
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
	groupType?: GroupType

	@Expose()
	@OmitNull()
	ownerId?: string

	@Expose()
	@OmitNull()
	membersCount?: number

	@Expose()
	isMember?: boolean

	@Expose()
	isOwner?: boolean
}

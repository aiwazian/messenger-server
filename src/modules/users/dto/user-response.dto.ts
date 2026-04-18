import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class UserResponseDto {
	@Expose()
	id: number

	@Expose()
	@OmitNull()
	firstName?: string

	@Expose()
	@OmitNull()
	lastName?: string

	@Expose()
	@OmitNull()
	username?: string

	@Expose()
	@OmitNull()
	bio?: string

	@Expose()
	@OmitNull()
	dateOfBirth?: number

	@Expose()
	@OmitNull()
	lastSeen?: number
}

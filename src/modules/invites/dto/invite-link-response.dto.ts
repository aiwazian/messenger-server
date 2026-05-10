import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class InviteLinkResponseDto {
	@Expose()
	id: string

	@Expose()
	chatId: string

	@Expose()
	code: string

	@Expose()
	@OmitNull()
	expiresAt?: string

	@Expose()
	@OmitNull()
	maxUses?: number

	@Expose()
	@OmitNull()
	uses?: number
}

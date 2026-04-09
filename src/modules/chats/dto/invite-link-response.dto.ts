import { Exclude, Expose, Transform } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class InviteLinkResponseDto {
	@Expose()
	@Transform(({ value }) => value.toString())
	id: string

	@Expose()
	chatId: string

	@Expose()
	code: string

	@Expose()
	link: string

	@Expose()
	@OmitNull()
	@Transform(({ value }) => value?.toString())
	expiresAt?: string

	@Expose()
	@OmitNull()
	maxUses?: number

	@Expose()
	uses: number
}

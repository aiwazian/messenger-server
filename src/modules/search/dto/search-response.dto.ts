import { Exclude, Expose } from 'class-transformer'
import { OmitNull } from '../../../common/decorators/omit-null.decorator'

@Exclude()
export class SearchResponseDto {
	@Expose()
	chatId: string

	@Expose()
	name: string

	@Expose()
	@OmitNull()
	username: string | null
}

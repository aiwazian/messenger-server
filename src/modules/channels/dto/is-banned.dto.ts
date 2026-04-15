import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class IsBannedDto {
	@Expose()
	isBanned: boolean
}

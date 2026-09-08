import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class StickerPackUsernameAvailabilityDto {
	@Expose()
	available: boolean
}

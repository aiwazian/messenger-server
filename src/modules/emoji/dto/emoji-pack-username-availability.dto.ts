import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class EmojiPackUsernameAvailabilityDto {
	@Expose()
	available: boolean
}

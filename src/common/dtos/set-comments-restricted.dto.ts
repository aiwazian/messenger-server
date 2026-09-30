import { IsBoolean } from 'class-validator'

/** true — комментировать посты могут только подписчики канала. */
export class SetCommentsRestrictedDto {
	@IsBoolean()
	commentsRestrictedToSubscribers: boolean
}

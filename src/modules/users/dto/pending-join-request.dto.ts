import { Expose } from 'class-transformer'

export class PendingJoinRequestDto {
	@Expose()
	chatId: string

	@Expose()
	chatName: string

	@Expose()
	createdAt: string
}

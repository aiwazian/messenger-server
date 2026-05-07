import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class AuthResponseDto {
	@Expose()
	userId: string

	@Expose()
	token: string

	@Expose()
	createdAt: string
}

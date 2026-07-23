import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class EmailResponseDto {
	@Expose()
	email: string
}

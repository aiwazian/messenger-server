import { IsEmail, MaxLength } from 'class-validator'

export class SetEmailDto {
	@IsEmail({}, { message: 'Invalid email format' })
	@MaxLength(254)
	email: string
}

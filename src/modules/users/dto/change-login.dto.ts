import { IsString, MinLength, MaxLength, Matches } from 'class-validator'

export class ChangeLoginDto {
	@IsString()
	@MinLength(5)
	@MaxLength(64)
	@Matches(/^\S+$/, {
		message: 'login must not contain spaces'
	})
	login: string
}

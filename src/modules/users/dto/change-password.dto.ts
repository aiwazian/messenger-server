import { IsString, MinLength, MaxLength, Matches } from 'class-validator'

export class ChangePasswordDto {
    @IsString()
    @MinLength(5)
    @MaxLength(32)
    @Matches(/^[a-zA-Z0-9_!@#$%^&*()\-+=\[\]{}|;:',.<>?/`"~]+$/, {
        message: 'Allowed characters are a-z, 0-9, underscores, and special symbols',
    })
    password: string
}

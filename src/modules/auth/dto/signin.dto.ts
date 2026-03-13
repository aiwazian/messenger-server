import { IsNotEmpty, IsString } from 'class-validator'
import { AuthCredentialsDto } from './auth-credentials.dto'
import { Trim } from 'src/common/decorators/trim.decorator'

export class SigninDto extends AuthCredentialsDto {
    @IsString()
    @Trim()
    @IsNotEmpty()
    deviceModel: string

    @IsString()
    @Trim()
    @IsNotEmpty()
    osVersion: string

    @IsString()
    @Trim()
    @IsNotEmpty()
    osName: string
}

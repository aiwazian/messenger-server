import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { Trim } from 'src/common/decorators/trim.decorator'
import { GroupType } from 'generated/prisma/client'

export class CreateGroupDto {
    @IsString()
    @Trim()
    @MinLength(1)
    @MaxLength(100)
    name: string

    @IsOptional()
    @IsString()
    @Trim()
    @MaxLength(100)
    bio?: string

    @IsOptional()
    @IsString()
    @Trim()
    @MinLength(3)
    @MaxLength(32)
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers and underscores' })
    username?: string

    @IsOptional()
    @IsEnum(GroupType)
    groupType?: GroupType
}

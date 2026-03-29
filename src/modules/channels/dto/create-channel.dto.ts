import {
	IsEnum,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	MinLength,
	ValidateIf
} from 'class-validator'
import { ChannelType } from '../../../../generated/prisma/client'
import { Trim } from 'src/common/decorators/trim.decorator'

export class CreateChannelDto {
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
	@IsEnum(ChannelType)
	channelType: ChannelType

	@ValidateIf((o) => o.channelType === ChannelType.PUBLIC)
	@IsString()
	@Trim()
	@MinLength(3, { message: 'Минимальная длинна 3 символа' })
	@MaxLength(32)
	@Matches(/^[a-zA-Z0-9_]+$/, {
		message: 'Username can only contain letters, numbers and underscores'
	})
	username?: string
}

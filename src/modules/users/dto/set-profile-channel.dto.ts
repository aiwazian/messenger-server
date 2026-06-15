import { Expose } from 'class-transformer'
import { IsNotEmpty, IsString } from 'class-validator'

export class SetProfileChannelDto {
	@Expose()
	@IsString()
	@IsNotEmpty()
	channelId: string
}

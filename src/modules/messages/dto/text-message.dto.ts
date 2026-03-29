import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { Trim } from 'src/common/decorators/trim.decorator'

export class TextMessageDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MaxLength(5000)
	text: string
}

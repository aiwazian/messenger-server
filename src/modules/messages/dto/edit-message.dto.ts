import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

export class EditMessageDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MaxLength(5000)
	text: string
}

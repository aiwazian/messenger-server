import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

export class TextMessageDto {
	@IsString()
	@Trim()
	@IsNotEmpty()
	@MaxLength(5000)
	text: string

	/** id сообщения, на которое отвечаем. Приходит строкой: id — BigInt. */
	@IsOptional()
	@IsNumberString()
	replyToId?: string
}

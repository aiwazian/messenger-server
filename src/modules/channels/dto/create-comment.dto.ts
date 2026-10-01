import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator'
import { Trim } from '../../../common/decorators/trim.decorator'

export class CreateCommentDto {
	/** Текст комментария; обязателен, если нет стикера. */
	@IsOptional()
	@IsString()
	@Trim()
	@MaxLength(5000)
	text?: string

	/** id стикера, отправляемого как комментарий. Приходит строкой: id — BigInt. */
	@IsOptional()
	@IsNumberString()
	stickerId?: string

	/** id комментария, на который отвечаем. Приходит строкой: id — BigInt. */
	@IsOptional()
	@IsNumberString()
	replyToId?: string
}

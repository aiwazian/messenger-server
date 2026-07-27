import { Transform } from 'class-transformer'
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNumberString } from 'class-validator'

/**
 * Тело запроса пересылки: куда копируем сообщение.
 *
 * id приходят числами из Kotlin (Long), но внутри всё работает на BigInt,
 * поэтому сразу приводим к строкам: number теряет точность на больших id.
 */
export class ForwardMessageDto {
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(30)
	@Transform(({ value }) => (Array.isArray(value) ? value.map((v) => String(v)) : value))
	@IsNumberString({}, { each: true })
	targetChatIds: string[]
}

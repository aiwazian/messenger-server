import { IsNumberString } from 'class-validator'

/**
 * Полезная нагрузка события chat:open.
 *
 * Раньше обработчик принимал any и разбирал две формы сразу — и объект, и
 * голый идентификатор. Идентификаторы чатов не помещаются в number, поэтому
 * клиент присылает строку, а BigInt из неё делает уже ChatId.
 */
export class ChatOpenDto {
	@IsNumberString({ no_symbols: true })
	chatId: string
}

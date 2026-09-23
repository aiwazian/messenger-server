import { IsBoolean } from 'class-validator'
import { MessageResponseDto } from './message-response.dto'

/**
 * Закрепление сообщения.
 *
 * forEveryone = true закрепляет сообщение для всех участников чата и требует
 * соответствующего права администратора в группах и каналах.
 */
export class PinMessageDto {
	@IsBoolean()
	forEveryone: boolean
}

/**
 * Закреплённое сообщение с точки зрения запросившего.
 *
 * chatId — «чат» в терминах UI: в личном чате это собеседник, а не получатель
 * из Message.chatId.
 */
export class MessagePinResponseDto {
	chatId: string
	messageId: string
	forEveryone: boolean
	pinnedAt: string
	message?: MessageResponseDto
}

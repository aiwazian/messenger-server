export class MessageFileDto {
	id: string
	name: string
	size: string
	mimeType: string
	status: string
}

export class MessageResponseDto {
	id: number
	senderId: string
	chatId: string
	text: string
	sendTime: number
	editedAt?: number
	isRead?: boolean
	files: MessageFileDto[]
}

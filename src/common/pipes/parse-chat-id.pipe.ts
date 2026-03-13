import { PipeTransform, BadRequestException } from '@nestjs/common'
import { MAX_INT64 } from '../constants/db.constants'
import { ChatId } from '../types/chat-id.type'

export class ParseChatIdPipe implements PipeTransform<string, ChatId> {
	transform(value: string): ChatId {
		let id: ChatId

		try {
			id = ChatId(value)
		} catch {
			throw new BadRequestException('Invalid channel id')
		}

		if (id > MAX_INT64) {
			throw new BadRequestException('Id is too large')
		}

		return id
	}
}

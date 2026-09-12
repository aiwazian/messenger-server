import { BadRequestException, PipeTransform } from '@nestjs/common'
import { MAX_INT64 } from '../constants/db.constants'
import { EmojiPackId } from '../types/emoji-pack-id.type'

export class ParseEmojiPackIdPipe implements PipeTransform<string, EmojiPackId> {
	transform(value: string): EmojiPackId {
		let id: EmojiPackId

		try {
			id = EmojiPackId(value)
		} catch {
			throw new BadRequestException('Invalid emoji pack id')
		}

		if (id > MAX_INT64) {
			throw new BadRequestException('Id is too large')
		}

		return id
	}
}

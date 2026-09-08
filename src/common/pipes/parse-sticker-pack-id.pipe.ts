import { BadRequestException, PipeTransform } from '@nestjs/common'
import { MAX_INT64 } from '../constants/db.constants'
import { StickerPackId } from '../types/sticker-pack-id.type'

export class ParseStickerPackIdPipe implements PipeTransform<string, StickerPackId> {
	transform(value: string): StickerPackId {
		let id: StickerPackId

		try {
			id = StickerPackId(value)
		} catch {
			throw new BadRequestException('Invalid sticker pack id')
		}

		if (id > MAX_INT64) {
			throw new BadRequestException('Id is too large')
		}

		return id
	}
}

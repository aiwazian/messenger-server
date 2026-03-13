import { PipeTransform, BadRequestException } from '@nestjs/common'
import { MAX_INT64 } from '../constants/db.constants'
import { ChannelId } from '../types/channel-id.type'

export class ParseChannelIdPipe implements PipeTransform<string, ChannelId> {
	transform(value: string): ChannelId {
		let id: ChannelId

		try {
			id = ChannelId(value)
		} catch {
			throw new BadRequestException('Invalid channel id')
		}

		if (id > MAX_INT64) {
			throw new BadRequestException('Id is too large')
		}

		return id
	}
}

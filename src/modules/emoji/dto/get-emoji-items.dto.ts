import { Transform } from 'class-transformer'
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, Matches } from 'class-validator'

export const MAX_EMOJI_ITEMS_PER_REQUEST = 200

export class GetEmojiItemsDto {
	@Transform(({ value }) =>
		typeof value === 'string'
			? value
					.split(',')
					.map(id => id.trim())
					.filter(id => id.length > 0)
			: value
	)
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(MAX_EMOJI_ITEMS_PER_REQUEST)
	@IsString({ each: true })
	@Matches(/^\d+$/, { each: true })
	ids: string[]
}

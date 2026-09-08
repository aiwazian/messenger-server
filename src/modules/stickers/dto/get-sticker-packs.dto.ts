import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'

export class GetStickerPacksDto {
	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	includeStickers?: boolean
}

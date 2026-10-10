import { Exclude, Expose } from 'class-transformer'
import { IsInt, IsNumber, IsString, Max, Min } from 'class-validator'

export const MAX_WALLPAPER_EFFECT_PERCENT = 90

@Exclude()
export class SetWallpaperDto {
	@Expose()
	@IsString()
	fileId: string

	@Expose()
	@IsInt()
	@Min(0)
	@Max(MAX_WALLPAPER_EFFECT_PERCENT)
	darken: number

	@Expose()
	@IsInt()
	@Min(0)
	@Max(MAX_WALLPAPER_EFFECT_PERCENT)
	blur: number

	@Expose()
	@IsNumber()
	@Min(-1)
	@Max(1)
	offsetX: number

	@Expose()
	@IsNumber()
	@Min(-1)
	@Max(1)
	offsetY: number
}

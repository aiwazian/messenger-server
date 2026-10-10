import { Expose } from 'class-transformer'
import { IsIn } from 'class-validator'
import { SetWallpaperDto } from './set-wallpaper.dto'

export class SetChatWallpaperDto extends SetWallpaperDto {
	@Expose()
	@IsIn(['me', 'all'])
	scope: 'me' | 'all'
}

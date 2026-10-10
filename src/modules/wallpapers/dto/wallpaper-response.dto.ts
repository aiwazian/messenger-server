import { Exclude, Expose } from 'class-transformer'

export enum WallpaperSource {
	USER = 'USER',
	CHAT = 'CHAT',
	CHANNEL = 'CHANNEL',
	GROUP = 'GROUP'
}

@Exclude()
export class WallpaperResponseDto {
	@Expose()
	id: number

	@Expose()
	fileId: string

	@Expose()
	url: string

	@Expose()
	name: string

	@Expose()
	mimeType: string

	@Expose()
	darken: number

	@Expose()
	blur: number

	@Expose()
	offsetX: number

	@Expose()
	offsetY: number

	@Expose()
	source: WallpaperSource
}

export class ChatWallpaperResponseDto {
	@Expose()
	wallpaper: WallpaperResponseDto | null
}

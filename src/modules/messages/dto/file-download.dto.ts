import { Exclude, Expose } from "class-transformer"

@Exclude()
export class FileDownloadDto {
	@Expose()
	downloadUrl: string

	@Expose()
	name: string

	@Expose()
	size: string

	@Expose()
	mimeType: string
}

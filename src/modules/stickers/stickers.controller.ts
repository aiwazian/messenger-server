import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Patch,
	Post,
	Query
} from '@nestjs/common'
import { CurrentUserId } from '../../common/decorators/user-id.decorator'
import { ParseStickerPackIdPipe } from '../../common/pipes/parse-sticker-pack-id.pipe'
import { StickerPackId } from '../../common/types/sticker-pack-id.type'
import { UserId } from '../../common/types/user-id.type'
import { FileInitDto } from '../messages/dto/file-init.dto'
import { FileDto } from '../storage/dto/file.dto'
import { InitUploadDto } from '../storage/dto/init-upload.dto'
import { CheckStickerPackUsernameDto } from './dto/check-sticker-pack-username.dto'
import { CreateStickerPackDto } from './dto/create-sticker-pack.dto'
import { StickerPackResponseDto } from './dto/sticker-pack-response.dto'
import { StickerPackUsernameAvailabilityDto } from './dto/sticker-pack-username-availability.dto'
import { UpdateStickerPackDto } from './dto/update-sticker-pack.dto'
import { StickersService } from './stickers.service'

/*
 * Порядок методов здесь значим: Nest сопоставляет маршруты в порядке
 * объявления, поэтому все точные пути идут до packs/:packId. Иначе слово
 * created уехало бы в :packId, а разбор идентификатора вернул бы 400.
 */
@Controller('stickers')
export class StickersController {
	constructor(private readonly stickersService: StickersService) {}

	@Get('packs/created')
	async getCreatedPacks(@CurrentUserId() userId: UserId): Promise<StickerPackResponseDto[]> {
		return this.stickersService.getCreatedPacks(userId)
	}

	@Get('packs/added')
	async getAddedPacks(@CurrentUserId() userId: UserId): Promise<StickerPackResponseDto[]> {
		return this.stickersService.getAddedPacks(userId)
	}

	@Get('packs/username-available')
	async checkUsername(
		@Query() dto: CheckStickerPackUsernameDto
	): Promise<StickerPackUsernameAvailabilityDto> {
		return this.stickersService.checkUsername(
			dto.username,
			dto.packId === undefined ? undefined : StickerPackId(dto.packId)
		)
	}

	/** Набор по имени из ссылки на добавление. */
	@Get('packs/by-username/:username')
	async getPackByUsername(
		@CurrentUserId() userId: UserId,
		@Param('username') username: string
	): Promise<StickerPackResponseDto> {
		return this.stickersService.getPackByUsername(userId, username)
	}

	@Get('packs/:packId')
	async getPack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseStickerPackIdPipe) packId: StickerPackId
	): Promise<StickerPackResponseDto> {
		return this.stickersService.getPack(userId, packId)
	}

	@Post('packs')
	async createPack(
		@CurrentUserId() userId: UserId,
		@Body() dto: CreateStickerPackDto
	): Promise<StickerPackResponseDto> {
		return this.stickersService.createPack(userId, dto)
	}

	@Patch('packs/:packId')
	async updatePack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseStickerPackIdPipe) packId: StickerPackId,
		@Body() dto: UpdateStickerPackDto
	): Promise<StickerPackResponseDto> {
		return this.stickersService.updatePack(userId, packId, dto)
	}

	@Delete('packs/:packId')
	@HttpCode(HttpStatus.NO_CONTENT)
	async deletePack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseStickerPackIdPipe) packId: StickerPackId
	): Promise<void> {
		await this.stickersService.deletePack(userId, packId)
	}

	@Post('packs/:packId/install')
	@HttpCode(HttpStatus.NO_CONTENT)
	async installPack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseStickerPackIdPipe) packId: StickerPackId
	): Promise<void> {
		await this.stickersService.installPack(userId, packId)
	}

	@Delete('packs/:packId/install')
	@HttpCode(HttpStatus.NO_CONTENT)
	async uninstallPack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseStickerPackIdPipe) packId: StickerPackId
	): Promise<void> {
		await this.stickersService.uninstallPack(userId, packId)
	}

	/*
	 * Загрузка картинки идёт до создания набора и потому не зависит от него:
	 * клиент получает форму, кладёт файл в хранилище напрямую и присылает
	 * только fileId, когда нажмёт сохранение набора.
	 */
	@Post('upload/init')
	async initStickerUpload(@Body() dto: FileInitDto): Promise<InitUploadDto> {
		return this.stickersService.initStickerUpload(dto)
	}

	@Post('upload/confirm/:fileId')
	async confirmStickerUpload(@Param('fileId') fileId: string): Promise<FileDto> {
		return this.stickersService.confirmStickerUpload(fileId)
	}
}

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
import { ParseEmojiPackIdPipe } from '../../common/pipes/parse-emoji-pack-id.pipe'
import { EmojiPackId } from '../../common/types/emoji-pack-id.type'
import { UserId } from '../../common/types/user-id.type'
import { FileDto } from '../storage/dto/file.dto'
import { InitUploadDto } from '../storage/dto/init-upload.dto'
import { CheckEmojiPackUsernameDto } from './dto/check-emoji-pack-username.dto'
import { CreateEmojiPackDto } from './dto/create-emoji-pack.dto'
import { EmojiPackIdDto } from './dto/emoji-pack-id.dto'
import { EmojiPackResponseDto } from './dto/emoji-pack-response.dto'
import { EmojiPackUsernameAvailabilityDto } from './dto/emoji-pack-username-availability.dto'
import { EmojiUploadInitDto } from './dto/emoji-upload-init.dto'
import { GetEmojiPacksDto } from './dto/get-emoji-packs.dto'
import { UpdateEmojiPackDto } from './dto/update-emoji-pack.dto'
import { EmojiService } from './emoji.service'

@Controller('emoji')
export class EmojiController {
	constructor(private readonly emojiService: EmojiService) {}

	@Get('packs/created')
	async getCreatedPacks(@CurrentUserId() userId: UserId): Promise<EmojiPackResponseDto[]> {
		return this.emojiService.getCreatedPacks(userId)
	}

	@Get('packs/added')
	async getAddedPacks(
		@CurrentUserId() userId: UserId,
		@Query() dto: GetEmojiPacksDto
	): Promise<EmojiPackResponseDto[]> {
		return this.emojiService.getAddedPacks(userId, dto.includeEmojis === true)
	}

	@Get('packs/username-available')
	async checkUsername(
		@Query() dto: CheckEmojiPackUsernameDto
	): Promise<EmojiPackUsernameAvailabilityDto> {
		return this.emojiService.checkUsername(
			dto.username,
			dto.packId === undefined ? undefined : EmojiPackId(dto.packId)
		)
	}

	@Get('packs/by-username/:username')
	async getPackByUsername(
		@CurrentUserId() userId: UserId,
		@Param('username') username: string
	): Promise<EmojiPackResponseDto> {
		return this.emojiService.getPackByUsername(userId, username)
	}

	@Get('packs/:packId')
	async getPack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseEmojiPackIdPipe) packId: EmojiPackId
	): Promise<EmojiPackResponseDto> {
		return this.emojiService.getPack(userId, packId)
	}

	@Post('packs/reserve')
	reservePackId(): EmojiPackIdDto {
		return this.emojiService.reservePackId()
	}

	@Post('packs')
	async createPack(
		@CurrentUserId() userId: UserId,
		@Body() dto: CreateEmojiPackDto
	): Promise<EmojiPackResponseDto> {
		return this.emojiService.createPack(userId, dto)
	}

	@Patch('packs/:packId')
	async updatePack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseEmojiPackIdPipe) packId: EmojiPackId,
		@Body() dto: UpdateEmojiPackDto
	): Promise<EmojiPackResponseDto> {
		return this.emojiService.updatePack(userId, packId, dto)
	}

	@Delete('packs/:packId')
	@HttpCode(HttpStatus.NO_CONTENT)
	async deletePack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseEmojiPackIdPipe) packId: EmojiPackId
	): Promise<void> {
		await this.emojiService.deletePack(userId, packId)
	}

	@Post('packs/:packId/install')
	@HttpCode(HttpStatus.NO_CONTENT)
	async installPack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseEmojiPackIdPipe) packId: EmojiPackId
	): Promise<void> {
		await this.emojiService.installPack(userId, packId)
	}

	@Delete('packs/:packId/install')
	@HttpCode(HttpStatus.NO_CONTENT)
	async uninstallPack(
		@CurrentUserId() userId: UserId,
		@Param('packId', ParseEmojiPackIdPipe) packId: EmojiPackId
	): Promise<void> {
		await this.emojiService.uninstallPack(userId, packId)
	}

	@Post('upload/init')
	async initEmojiUpload(@Body() dto: EmojiUploadInitDto): Promise<InitUploadDto> {
		return this.emojiService.initEmojiUpload(dto)
	}

	@Post('upload/confirm/:fileId')
	async confirmEmojiUpload(@Param('fileId') fileId: string): Promise<FileDto> {
		return this.emojiService.confirmEmojiUpload(fileId)
	}
}

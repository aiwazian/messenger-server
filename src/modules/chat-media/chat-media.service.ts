import { Injectable } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { AttachmentType, FileStatus } from '../../generated/prisma/enums'
import { Prisma } from '../../generated/prisma/client'
import { MessagesService } from '../messages/messages.service'
import { ChatMediaQueryDto } from './dto/chat-media-query.dto'
import { ChatMediaCountsResponseDto, ChatMediaResponseDto } from './dto/chat-media-response.dto'

const MEDIA_TYPES: AttachmentType[] = [AttachmentType.IMAGE, AttachmentType.VIDEO]

const FILE_TYPES: AttachmentType[] = [AttachmentType.FILE]

const VOICE_TYPES: AttachmentType[] = [AttachmentType.VOICE]

const MUSIC_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'wma', 'amr']

const MUSIC_NAME_FILTERS: Prisma.FileWhereInput[] = MUSIC_EXTENSIONS.map((extension) => ({
	name: { endsWith: `.${extension}`, mode: 'insensitive' }
}))

const DEFAULT_FILE_WHERE: Prisma.FileWhereInput = { status: { not: FileStatus.FAILED } }

@Injectable()
export class ChatMediaService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly messagesService: MessagesService
	) {}

	getMedia(userId: UserId, chatId: ChatId, dto: ChatMediaQueryDto): Promise<ChatMediaResponseDto> {
		return this.getAttachments(userId, chatId, MEDIA_TYPES, dto)
	}

	getFiles(userId: UserId, chatId: ChatId, dto: ChatMediaQueryDto): Promise<ChatMediaResponseDto> {
		return this.getAttachments(userId, chatId, FILE_TYPES, dto, {
			status: { not: FileStatus.FAILED },
			NOT: { OR: MUSIC_NAME_FILTERS }
		})
	}

	getMusic(userId: UserId, chatId: ChatId, dto: ChatMediaQueryDto): Promise<ChatMediaResponseDto> {
		return this.getAttachments(userId, chatId, FILE_TYPES, dto, {
			status: { not: FileStatus.FAILED },
			OR: MUSIC_NAME_FILTERS
		})
	}

	getVoices(userId: UserId, chatId: ChatId, dto: ChatMediaQueryDto): Promise<ChatMediaResponseDto> {
		return this.getAttachments(userId, chatId, VOICE_TYPES, dto)
	}

	async getCounts(userId: UserId, chatId: ChatId): Promise<ChatMediaCountsResponseDto> {
		const chatMessagesWhere = this.messagesService.buildChatMessagesWhere(userId, chatId)

		const [grouped, musicCount] = await Promise.all([
			this.prisma.messageAttachment.groupBy({
				by: ['type'],
				where: {
					message: chatMessagesWhere,
					file: { status: { not: FileStatus.FAILED } }
				},
				_count: { _all: true }
			}),
			this.prisma.messageAttachment.count({
				where: {
					message: chatMessagesWhere,
					type: AttachmentType.FILE,
					file: { status: { not: FileStatus.FAILED }, OR: MUSIC_NAME_FILTERS }
				}
			})
		])

		const counts = new Map<AttachmentType, number>()
		for (const row of grouped) {
			counts.set(row.type, row._count._all)
		}

		return plainToInstance(ChatMediaCountsResponseDto, {
			photos: counts.get(AttachmentType.IMAGE) ?? 0,
			videos: counts.get(AttachmentType.VIDEO) ?? 0,
			files: (counts.get(AttachmentType.FILE) ?? 0) - musicCount,
			music: musicCount,
			voices: counts.get(AttachmentType.VOICE) ?? 0
		})
	}

	private async getAttachments(
		userId: UserId,
		chatId: ChatId,
		types: AttachmentType[],
		dto: ChatMediaQueryDto,
		fileWhere: Prisma.FileWhereInput = DEFAULT_FILE_WHERE
	): Promise<ChatMediaResponseDto> {
		const where: Prisma.MessageAttachmentWhereInput = {
			type: { in: types },
			message: this.messagesService.buildChatMessagesWhere(userId, chatId),
			file: fileWhere
		}

		const rows = await this.prisma.messageAttachment.findMany({
			where,
			include: {
				file: {
					select: { name: true, size: true, mimeType: true, width: true, height: true }
				},
				message: { select: { sendTime: true, senderId: true } }
			},
			orderBy: { id: 'desc' },
			take: dto.limit + 1,
			...(dto.cursorId ? { cursor: { id: dto.cursorId }, skip: 1 } : {})
		})

		const page = rows.slice(0, dto.limit)
		const hasMore = rows.length > dto.limit

		return plainToInstance(ChatMediaResponseDto, {
			items: page.map((row) => ({
				id: row.id,
				fileId: row.fileId,
				messageId: Number(row.messageId),
				senderId: Number(row.message.senderId),
				name: row.file.name,
				size: Number(row.file.size),
				mimeType: row.file.mimeType,
				type: row.type,
				sendTime: Number(row.message.sendTime),
				width: row.file.width,
				height: row.file.height
			})),
			nextCursorId: hasMore ? page[page.length - 1]?.id : undefined
		})
	}
}

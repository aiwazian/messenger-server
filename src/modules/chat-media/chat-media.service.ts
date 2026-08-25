import { Injectable } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { AttachmentType, FileStatus } from '../../generated/prisma/enums'
import { Prisma } from '../../generated/prisma/client'
import { MessagesService } from '../messages/messages.service'
import { ChatMediaQueryDto } from './dto/chat-media-query.dto'
import { ChatMediaResponseDto } from './dto/chat-media-response.dto'

/** Фото и видео: то, что открывается во весь экран, а не скачивается документом. */
const MEDIA_TYPES: AttachmentType[] = [AttachmentType.IMAGE, AttachmentType.VIDEO]

/** Документы. Голосовые сюда не попадают: они живут только внутри переписки. */
const FILE_TYPES: AttachmentType[] = [AttachmentType.FILE]

/**
 * Вложения чата отдельным списком, без загрузки самой переписки.
 *
 * Выборка идёт по MessageAttachment, а не по Message: одно сообщение может
 * нести десять фото, и лист из сообщений пришлось бы разворачивать на клиенте,
 * теряя постраничность.
 *
 * Видимость считается тем же условием, что и история чата
 * ([MessagesService.buildChatMessagesWhere]): удалённое лично для пользователя
 * сообщение не должно всплыть в галерее.
 */
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
		return this.getAttachments(userId, chatId, FILE_TYPES, dto)
	}

	private async getAttachments(
		userId: UserId,
		chatId: ChatId,
		types: AttachmentType[],
		dto: ChatMediaQueryDto
	): Promise<ChatMediaResponseDto> {
		const where: Prisma.MessageAttachmentWhereInput = {
			type: { in: types },
			message: this.messagesService.buildChatMessagesWhere(userId, chatId),
			/* Незалившийся файл скачать нечем: показывать его в галерее нечестно. */
			file: { status: { not: FileStatus.FAILED } }
		}

		const rows = await this.prisma.messageAttachment.findMany({
			where,
			include: {
				file: { select: { name: true, size: true, mimeType: true } },
				message: { select: { sendTime: true } }
			},
			orderBy: { id: 'desc' },
			take: dto.limit + 1,
			...(dto.cursorId ? { cursor: { id: dto.cursorId }, skip: 1 } : {})
		})

		const page = rows.slice(0, dto.limit)
		const hasMore = rows.length > dto.limit

		/*
		 * BigInt приводится к числу здесь, а не глобальным перехватчиком: тот отдаёт
		 * строку, и клиенту пришлось бы разбирать её вручную. Идентификаторы, размеры
		 * и время отправки в безопасный диапазон Number укладываются с запасом.
		 */
		return plainToInstance(ChatMediaResponseDto, {
			items: page.map((row) => ({
				id: row.id,
				fileId: row.fileId,
				messageId: Number(row.messageId),
				name: row.file.name,
				size: Number(row.file.size),
				mimeType: row.file.mimeType,
				type: row.type,
				sendTime: Number(row.message.sendTime)
			})),
			nextCursorId: hasMore ? page[page.length - 1]?.id : undefined
		})
	}
}

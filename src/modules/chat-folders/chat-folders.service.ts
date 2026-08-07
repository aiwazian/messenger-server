import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../../common/types/user-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { ChatFolderCategory } from '../../generated/prisma/enums'
import { ChatFolderResponseDto } from './dto/chat-folder-response.dto'
import { CreateChatFolderDto } from './dto/create-chat-folder.dto'
import { PinFolderChatsDto } from './dto/pin-folder-chats.dto'
import { ReorderChatFoldersDto } from './dto/reorder-chat-folders.dto'
import { UpdateChatFolderDto } from './dto/update-chat-folder.dto'

type ChatFolderWithRelations = {
	id: number
	name: string
	sortOrder: number
	categories: Array<{ category: ChatFolderCategory }>
	chats: Array<{ chatId: bigint; isIncluded: boolean; isPinned: boolean; sortOrder: number }>
}

@Injectable()
export class ChatFoldersService {
	constructor(private readonly prisma: PrismaService) {}

	async getFolders(userId: UserId): Promise<ChatFolderResponseDto[]> {
		const folders = await this.prisma.chatFolder.findMany({
			where: { userId },
			orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
			include: {
				chats: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
				categories: { orderBy: { id: 'asc' } }
			}
		})

		return folders.map((folder) => this.toResponse(folder))
	}

	async createFolder(userId: UserId, dto: CreateChatFolderDto): Promise<ChatFolderResponseDto> {
		const chatIds = await this.filterOwnedChatIds(userId, dto.chatIds)
		const categories = this.normalizeCategories(dto.categories)

		const lastFolder = await this.prisma.chatFolder.findFirst({
			where: { userId },
			orderBy: { sortOrder: 'desc' },
			select: { sortOrder: true }
		})

		const folder = await this.prisma.chatFolder.create({
			data: {
				userId,
				name: dto.name.trim(),
				sortOrder: (lastFolder?.sortOrder ?? -1) + 1,
				createdAt: BigInt(Date.now()),
				categories: {
					create: categories.map((category) => ({ category }))
				},
				chats: {
					create: chatIds.map((chatId, index) => ({
						chatId,
						isIncluded: true,
						sortOrder: index
					}))
				}
			},
			include: {
				chats: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
				categories: { orderBy: { id: 'asc' } }
			}
		})

		return this.toResponse(folder)
	}

	async updateFolder(
		userId: UserId,
		folderId: number,
		dto: UpdateChatFolderDto
	): Promise<ChatFolderResponseDto> {
		await this.assertFolderOwner(userId, folderId)

		const chatIds = dto.chatIds ? await this.filterOwnedChatIds(userId, dto.chatIds) : null
		const categories = dto.categories ? this.normalizeCategories(dto.categories) : null

		await this.prisma.$transaction(async (tx) => {
			if (dto.name !== undefined) {
				await tx.chatFolder.update({
					where: { id: folderId },
					data: { name: dto.name.trim() }
				})
			}

			if (categories) {
				await tx.chatFolderCategoryFilter.deleteMany({ where: { folderId } })

				if (categories.length > 0) {
					await tx.chatFolderCategoryFilter.createMany({
						data: categories.map((category) => ({ folderId, category }))
					})
				}
			}

			if (chatIds) {
				const existingChats = await tx.chatFolderChat.findMany({
					where: { folderId },
					select: { chatId: true, isPinned: true }
				})

				const pinnedIds = new Set(
					existingChats.filter((chat) => chat.isPinned).map((chat) => chat.chatId.toString())
				)

				const includedIds = new Set(chatIds.map((chatId) => chatId.toString()))

				await tx.chatFolderChat.deleteMany({ where: { folderId } })

				const includedRows = chatIds.map((chatId, index) => ({
					folderId,
					chatId,
					isIncluded: true,
					sortOrder: index,
					isPinned: pinnedIds.has(chatId.toString())
				}))

				/// Закрепление чата, попавшего в папку через категорию, переживает
				/// пересохранение состава: в список поимённых чатов он не входит.
				const pinnedOnlyRows = existingChats
					.filter((chat) => chat.isPinned && !includedIds.has(chat.chatId.toString()))
					.map((chat, index) => ({
						folderId,
						chatId: chat.chatId,
						isIncluded: false,
						sortOrder: chatIds.length + index,
						isPinned: true
					}))

				const rows = [...includedRows, ...pinnedOnlyRows]

				if (rows.length > 0) {
					await tx.chatFolderChat.createMany({ data: rows })
				}
			}
		})

		return this.getFolder(userId, folderId)
	}

	async deleteFolder(userId: UserId, folderId: number): Promise<void> {
		await this.assertFolderOwner(userId, folderId)

		await this.prisma.chatFolder.delete({ where: { id: folderId } })
	}

	/// Закрепление принадлежит папке, а не чату: чат, попавший в папку через
	/// категорию, своей строки не имеет, поэтому она заводится на лету и в
	/// состав папки чат при этом не добавляется.
	async setChatsPinned(
		userId: UserId,
		folderId: number,
		dto: PinFolderChatsDto,
		isPinned: boolean
	): Promise<void> {
		await this.assertFolderOwner(userId, folderId)

		const chatIds = await this.filterOwnedChatIds(userId, dto.chatIds)

		if (chatIds.length === 0) {
			return
		}

		const lastChat = await this.prisma.chatFolderChat.findFirst({
			where: { folderId },
			orderBy: { sortOrder: 'desc' },
			select: { sortOrder: true }
		})

		let nextSortOrder = (lastChat?.sortOrder ?? -1) + 1

		await this.prisma.$transaction(
			chatIds.map((chatId) =>
				this.prisma.chatFolderChat.upsert({
					where: { folderId_chatId: { folderId, chatId } },
					update: { isPinned },
					create: {
						folderId,
						chatId,
						isIncluded: false,
						isPinned,
						sortOrder: nextSortOrder++
					}
				})
			)
		)
	}

	/// Порядок вкладок задаётся списком id: позиция в массиве становится sortOrder.
	async reorderFolders(
		userId: UserId,
		dto: ReorderChatFoldersDto
	): Promise<ChatFolderResponseDto[]> {
		const folders = await this.prisma.chatFolder.findMany({
			where: { userId },
			select: { id: true }
		})

		const ownedIds = new Set(folders.map((folder) => folder.id))
		const orderedIds = Array.from(new Set(dto.folderIds)).filter((folderId) =>
			ownedIds.has(folderId)
		)

		await this.prisma.$transaction(
			orderedIds.map((folderId, index) =>
				this.prisma.chatFolder.update({
					where: { id: folderId },
					data: { sortOrder: index }
				})
			)
		)

		return this.getFolders(userId)
	}

	private async getFolder(userId: UserId, folderId: number): Promise<ChatFolderResponseDto> {
		const folder = await this.prisma.chatFolder.findFirst({
			where: { id: folderId, userId },
			include: {
				chats: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
				categories: { orderBy: { id: 'asc' } }
			}
		})

		if (!folder) {
			throw new NotFoundException('Chat folder not found')
		}

		return this.toResponse(folder)
	}

	private async assertFolderOwner(userId: UserId, folderId: number): Promise<void> {
		const folder = await this.prisma.chatFolder.findUnique({
			where: { id: folderId },
			select: { userId: true }
		})

		if (!folder) {
			throw new NotFoundException('Chat folder not found')
		}

		if (folder.userId !== userId) {
			throw new ForbiddenException('Chat folder belongs to another user')
		}
	}

	/// В папку попадают только чаты, которые уже есть у пользователя:
	/// чужой id из тела запроса молча отбрасывается.
	private async filterOwnedChatIds(userId: UserId, rawChatIds?: string[]): Promise<bigint[]> {
		const uniqueIds = Array.from(new Set(rawChatIds ?? [])).map((chatId) => ChatId(chatId))

		if (uniqueIds.length === 0) {
			return []
		}

		const ownedChats = await this.prisma.chat.findMany({
			where: { userId, chatId: { in: uniqueIds } },
			select: { chatId: true }
		})

		const ownedIds = new Set(ownedChats.map((chat) => chat.chatId.toString()))

		return uniqueIds.filter((chatId) => ownedIds.has(chatId.toString()))
	}

	private normalizeCategories(categories?: ChatFolderCategory[]): ChatFolderCategory[] {
		return Array.from(new Set(categories ?? []))
	}

	private toResponse(folder: ChatFolderWithRelations): ChatFolderResponseDto {
		return plainToInstance(ChatFolderResponseDto, {
			id: folder.id,
			name: folder.name,
			sortOrder: folder.sortOrder,
			categories: folder.categories.map((filter) => filter.category),
			chats: folder.chats.map((chat) => ({
				chatId: chat.chatId.toString(),
				isIncluded: chat.isIncluded,
				isPinned: chat.isPinned,
				sortOrder: chat.sortOrder
			}))
		})
	}
}

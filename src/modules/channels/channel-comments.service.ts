import { plainToInstance } from 'class-transformer'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { EncryptionService } from '../encryption/encryption.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { StorageService } from '../storage/storage.service'
import { SocketEvent } from '../../common/socket/socket-events'
import { CommentAuthorRole } from '../../common/enums/comment-author-role.enum'
import { FileType } from '../../common/enums/file-type.enum'
import {
	CommentReplyPreviewDto,
	CommentResponseDto
} from './dto/comment-response.dto'
import { CreateCommentDto } from './dto/create-comment.dto'
import { ConfirmCommentDto } from './dto/confirm-comment.dto'
import { EditCommentDto } from './dto/edit-comment.dto'
import { FileInitDto } from '../messages/dto/file-init.dto'
import { MessageAttachmentDto, MessageStickerDto } from '../messages/dto/message-response.dto'
import { COMMENT_INCLUDE, CommentWithRelations } from './comment-include.const'
import { ChannelId } from '../../common/types/channel-id.type'
import { ChatId } from '../../common/types/chat-id.type'
import { UserId } from '../../common/types/user-id.type'
import { AttachmentType, MessageType } from '../../generated/prisma/enums'

const MAX_COMMENT_ATTACHMENTS = 10

type ChannelCommentContext = {
	ownerId: bigint
	commentsEnabled: boolean
	commentsRestrictedToSubscribers: boolean
	adminUserIds: Set<string>
	adminCanDeleteComments: Set<string>
}

@Injectable()
export class ChannelCommentsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		private readonly realtimeGateway: RealtimeGateway,
		private readonly storageService: StorageService
	) {}

	async list(
		channelId: ChannelId,
		postId: number,
		userId: UserId
	): Promise<CommentResponseDto[]> {
		await this.getExistingPost(channelId, postId)

		const [comments, channel] = await Promise.all([
			this.prisma.comment.findMany({
				where: { postId: BigInt(postId) },
				include: COMMENT_INCLUDE,
				orderBy: { id: 'asc' }
			}),
			this.getChannelCommentContext(channelId)
		])

		return comments.map((comment) => this.mapComment(comment, channel))
	}

	async create(
		channelId: ChannelId,
		postId: number,
		userId: UserId,
		dto: CreateCommentDto,
		excludeSocketId?: string
	): Promise<CommentResponseDto> {
		await this.getExistingPost(channelId, postId)
		const channel = await this.getChannelCommentContext(channelId)
		await this.assertCanComment(channelId, channel, userId)

		const text = dto.text?.trim()
		const rawStickerId = dto.stickerId

		if (!text && !rawStickerId) {
			throw new BadRequestException('Comment text or sticker is required')
		}

		let stickerId: bigint | null = null
		let messageType: MessageType = MessageType.TEXT
		let encrypted: string | null = null
		let keyVersion = this.encryption.currentVersion

		if (rawStickerId) {
			const sticker = await this.prisma.sticker.findUnique({
				where: { id: BigInt(rawStickerId) }
			})
			if (!sticker) throw new NotFoundException('Sticker not found')

			stickerId = sticker.id
			messageType = MessageType.STICKER
		}

		if (text) {
			const { encrypted: encryptedText, version } = this.encryption.encrypt(text)
			encrypted = encryptedText
			keyVersion = version
		}

		let replyToId: bigint | null = null

		if (dto.replyToId) {
			const target = await this.prisma.comment.findFirst({
				where: { id: BigInt(dto.replyToId), postId: BigInt(postId) },
				select: { id: true }
			})
			if (!target) throw new NotFoundException('Reply comment not found')

			replyToId = target.id
		}

		const comment = await this.prisma.comment.create({
			data: {
				postId: BigInt(postId),
				channelId,
				senderId: userId,
				text: encrypted,
				messageType,
				stickerId,
				sendTime: Date.now(),
				encryptionKeyVersion: keyVersion,
				replyToId
			},
			include: COMMENT_INCLUDE
		})

		const commentDto = this.mapComment(comment, channel)

		this.realtimeGateway.sendToChat(
			ChatId(channelId),
			SocketEvent.COMMENT_NEW,
			{ chatId: channelId, postId: BigInt(postId), comment: commentDto },
			excludeSocketId
		)

		return commentDto
	}

	async confirm(
		channelId: ChannelId,
		postId: number,
		userId: UserId,
		dto: ConfirmCommentDto,
		excludeSocketId?: string
	): Promise<CommentResponseDto> {
		await this.getExistingPost(channelId, postId)
		const channel = await this.getChannelCommentContext(channelId)
		await this.assertCanComment(channelId, channel, userId)

		if (!dto.attachments || dto.attachments.length === 0) {
			throw new BadRequestException('At least one attachment is required')
		}

		if (dto.attachments.length > MAX_COMMENT_ATTACHMENTS) {
			throw new BadRequestException(
				`A comment can contain up to ${MAX_COMMENT_ATTACHMENTS} attachments`
			)
		}

		const text = dto.text?.trim()
		let encrypted: string | null = null
		let keyVersion = this.encryption.currentVersion

		if (text) {
			const { encrypted: encryptedText, version } = this.encryption.encrypt(text)
			encrypted = encryptedText
			keyVersion = version
		}

		const attachmentsToCreate = []

		for (let i = 0; i < dto.attachments.length; i++) {
			const att = dto.attachments[i]
			await this.storageService.confirmUpload(att.fileId)

			const file = await this.prisma.file.findUnique({ where: { id: att.fileId } })
			if (!file) throw new NotFoundException(`File ${att.fileId} not found`)

			let attachmentType = att.type || AttachmentType.FILE

			if (attachmentType === AttachmentType.IMAGE && !file.mimeType.startsWith('image/')) {
				attachmentType = AttachmentType.FILE
			} else if (attachmentType === AttachmentType.VIDEO && !file.mimeType.startsWith('video/')) {
				attachmentType = AttachmentType.FILE
			}

			attachmentsToCreate.push({
				fileId: att.fileId,
				type: attachmentType,
				sortOrder: i
			})
		}

		const comment = await this.prisma.comment.create({
			data: {
				postId: BigInt(postId),
				channelId,
				senderId: userId,
				text: encrypted,
				messageType: MessageType.TEXT,
				sendTime: Date.now(),
				encryptionKeyVersion: keyVersion,
				attachments: { create: attachmentsToCreate }
			},
			include: COMMENT_INCLUDE
		})

		const commentDto = this.mapComment(comment, channel)

		this.realtimeGateway.sendToChat(
			ChatId(channelId),
			SocketEvent.COMMENT_NEW,
			{ chatId: channelId, postId: BigInt(postId), comment: commentDto },
			excludeSocketId
		)

		return commentDto
	}

	async edit(
		channelId: ChannelId,
		postId: number,
		commentId: number,
		userId: UserId,
		dto: EditCommentDto,
		excludeSocketId?: string
	): Promise<CommentResponseDto> {
		const comment = await this.prisma.comment.findFirst({
			where: { id: BigInt(commentId), postId: BigInt(postId), channelId }
		})
		if (!comment) throw new NotFoundException('Comment not found')

		const channel = await this.getChannelCommentContext(channelId)
		await this.assertCanComment(channelId, channel, userId)

		if (comment.senderId !== userId) {
			throw new ForbiddenException('You can edit only your own comments')
		}

		if (comment.messageType === MessageType.STICKER) {
			throw new BadRequestException('Sticker comments cannot be edited')
		}

		const { encrypted, version } = this.encryption.encrypt(dto.text)

		const updated = await this.prisma.comment.update({
			where: { id: comment.id },
			data: {
				text: encrypted,
				encryptionKeyVersion: version,
				isEdited: true,
				editedAt: Date.now()
			},
			include: COMMENT_INCLUDE
		})

		const commentDto = this.mapComment(updated, channel)

		this.realtimeGateway.sendToChat(
			ChatId(channelId),
			SocketEvent.COMMENT_EDIT,
			{ chatId: channelId, postId: BigInt(postId), comment: commentDto },
			excludeSocketId
		)

		return commentDto
	}

	async delete(
		channelId: ChannelId,
		postId: number,
		commentId: number,
		userId: UserId,
		excludeSocketId?: string
	): Promise<void> {
		const comment = await this.prisma.comment.findFirst({
			where: { id: BigInt(commentId), postId: BigInt(postId), channelId },
			select: { id: true, senderId: true }
		})
		if (!comment) throw new NotFoundException('Comment not found')

		const channel = await this.getChannelCommentContext(channelId)
		const isOwn = comment.senderId === userId
		const canDeleteOthers =
			channel.ownerId === userId || channel.adminCanDeleteComments.has(userId.toString())

		if (!isOwn && !canDeleteOthers) {
			throw new ForbiddenException('You can delete only your own comments')
		}

		await this.prisma.comment.delete({ where: { id: comment.id } })

		this.realtimeGateway.sendToChat(
			ChatId(channelId),
			SocketEvent.COMMENT_DELETE,
			{ chatId: channelId, postId: BigInt(postId), commentId: BigInt(commentId) },
			excludeSocketId
		)
	}

	async initFileUpload(
		channelId: ChannelId,
		postId: number,
		userId: UserId,
		dto: FileInitDto
	) {
		await this.getExistingPost(channelId, postId)
		const channel = await this.getChannelCommentContext(channelId)
		await this.assertCanComment(channelId, channel, userId)

		return this.storageService.initUpload({
			...dto,
			directory: FileType.CHAT_ATTACHMENT
		})
	}

	async getFileDownloadUrl(
		channelId: ChannelId,
		postId: number,
		commentId: number,
		fileId: string
	): Promise<{ downloadUrl: string }> {
		await this.getExistingPost(channelId, postId)

		const comment = await this.prisma.comment.findFirst({
			where: { id: BigInt(commentId), postId: BigInt(postId), channelId },
			include: { attachments: true }
		})
		if (!comment) throw new NotFoundException('Comment not found')

		const file = comment.attachments.find((a) => a.fileId === fileId)
		if (!file) throw new NotFoundException('File not found in this comment')

		return this.storageService.getDownloadUrl(fileId)
	}

	async deleteAll(channelId: ChannelId): Promise<void> {
		await this.prisma.comment.deleteMany({ where: { channelId } })

		this.realtimeGateway.sendToChat(ChatId(channelId), SocketEvent.COMMENTS_CLEARED, {
			chatId: channelId
		})
	}

	private async getExistingPost(channelId: ChannelId, postId: number): Promise<{ id: bigint }> {
		const post = await this.prisma.message.findFirst({
			where: { id: BigInt(postId), chatId: channelId },
			select: { id: true }
		})
		if (!post) throw new NotFoundException('Post not found')

		return post
	}

	private async getChannelCommentContext(channelId: ChannelId): Promise<ChannelCommentContext> {
		const channel = await this.prisma.channel.findUnique({
			where: { id: channelId },
			select: {
				ownerId: true,
				commentsEnabled: true,
				commentsRestrictedToSubscribers: true,
				adminPermissions: { select: { userId: true, canDeleteComments: true } }
			}
		})
		if (!channel) throw new NotFoundException('Channel not found')

		return {
			ownerId: channel.ownerId,
			commentsEnabled: channel.commentsEnabled,
			commentsRestrictedToSubscribers: channel.commentsRestrictedToSubscribers,
			adminUserIds: new Set(channel.adminPermissions.map((a) => a.userId.toString())),
			adminCanDeleteComments: new Set(
				channel.adminPermissions.filter((a) => a.canDeleteComments).map((a) => a.userId.toString())
			)
		}
	}

	private async assertCanComment(
		channelId: ChannelId,
		channel: ChannelCommentContext,
		userId: UserId
	): Promise<void> {
		if (!channel.commentsEnabled) {
			throw new ForbiddenException('Comments are disabled for this channel')
		}

		const isOwner = channel.ownerId === userId
		const isAdmin = channel.adminUserIds.has(userId.toString())

		if (isOwner || isAdmin) return

		const isBanned = await this.prisma.channelBlackList.findFirst({
			where: { channelId, userId }
		})
		if (isBanned) throw new ForbiddenException('You are banned from this channel')

		if (channel.commentsRestrictedToSubscribers) {
			const subscriber = await this.prisma.channelSubscriber.findUnique({
				where: { userId_channelId: { userId, channelId } }
			})
			if (!subscriber) throw new ForbiddenException('Only subscribers can comment')
		}
	}

	private mapComment(
		comment: CommentWithRelations,
		channel: ChannelCommentContext
	): CommentResponseDto {
		const senderRole =
			comment.senderId === channel.ownerId
				? CommentAuthorRole.OWNER
				: channel.adminUserIds.has(comment.senderId.toString())
					? CommentAuthorRole.ADMIN
					: CommentAuthorRole.MEMBER

		return plainToInstance(CommentResponseDto, {
			id: comment.id,
			postId: comment.postId,
			senderId: comment.senderId,
			messageType: comment.messageType,
			text: comment.text
				? this.encryption.decrypt(comment.text, comment.encryptionKeyVersion)
				: undefined,
			sendTime: comment.sendTime,
			isEdited: comment.isEdited || undefined,
			editedAt: comment.editedAt || undefined,
			senderRole,
			sticker: comment.sticker
				? plainToInstance(MessageStickerDto, comment.sticker)
				: undefined,
			attachments: comment.attachments.map((f) =>
				plainToInstance(MessageAttachmentDto, {
					...f.file,
					fileId: f.fileId,
					type: f.type,
					sortOrder: f.sortOrder
				})
			),
			replyTo: comment.replyTo
				? plainToInstance(CommentReplyPreviewDto, {
						id: comment.replyTo.id,
						senderId: comment.replyTo.senderId,
						messageType: comment.replyTo.messageType,
						text: comment.replyTo.text
							? this.encryption.decrypt(
									comment.replyTo.text,
									comment.replyTo.encryptionKeyVersion
								)
							: undefined,
						senderName:
							`${comment.replyTo.sender.firstName ?? ''} ${comment.replyTo.sender.lastName ?? ''}`
								.trim() || undefined,
						stickerEmoji: comment.replyTo.sticker?.emojis?.[0]
					})
				: undefined,
			sender: comment.sender
		})
	}
}

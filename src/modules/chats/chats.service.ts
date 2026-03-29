import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { UserId } from 'src/common/types/user-id.type'
import { ChatResponseDto } from './dto/chat-response.dto'
import { plainToInstance } from 'class-transformer'
import { ChatId } from 'src/common/types/chat-id.type'
import { ConversationType, Prisma } from 'generated/prisma/client'
import { ChatType } from 'src/common/enums/chat-type.enum'
import { detectChatType } from 'src/common/utils/detect-chat-type.util'
import { MessageResponseDto } from '../messages/dto/message-response.dto'
import { PrismaService } from 'src/providers/prisma/prisma.service'

@Injectable()
export class ChatsService {
	constructor(private readonly prisma: PrismaService) {}

	async getAll(userId: UserId): Promise<ChatResponseDto[]> {
		// Optimized: Include members in the initial query to avoid N+1 for direct chats
		const chats = await this.prisma.chat.findMany({
			where: { userId: userId },
			include: {
				conversation: {
					include: {
						group: true,
						channel: true,
						members: {
							include: {
								user: {
									select: {
										id: true,
										firstName: true,
										lastName: true
									}
								}
							}
						}
					}
				}
			}
		})

		if (chats.length === 0) {
			return []
		}

		// Batch fetch last messages for all conversations in parallel
		const conversationIds = chats.map((c) => c.conversationId)
		const lastMessages = await this.prisma.message.findMany({
			where: { conversationId: { in: conversationIds } },
			orderBy: { sendTime: 'desc' },
			distinct: ['conversationId'],
			select: {
				id: true,
				text: true,
				sendTime: true,
				senderId: true,
				conversationId: true,
				files: true
			}
		})

		// Create map for O(1) lookup
		const lastMessagesMap = new Map(lastMessages.map((m) => [m.conversationId, m]))

		const chatsWithTitle = chats.map((chat) => {
			let title = ''
			let chatId: bigint | null = null

			switch (chat.conversation.type) {
				case ConversationType.DIRECT: {
					chatId = chat.targetId || userId
					const otherMember = chat.conversation.members.find((m) => m.userId === chatId)
					if (otherMember) {
						title = `${otherMember.user.firstName ?? ''} ${otherMember.user.lastName ?? ''}`.trim()
					} else if (chat.conversation.isSelfConversation) {
						title = 'Saved messages'
					} else {
						title = 'Deleted User'
					}
					break
				}
				case ConversationType.CHANNEL: {
					if (chat.conversation.channel) {
						chatId = chat.conversation.channelId
						title = chat.conversation.channel.name
					}
					break
				}
				case ConversationType.GROUP: {
					if (chat.conversation.group) {
						chatId = chat.conversation.groupId
						title = chat.conversation.group.name
					}
					break
				}
			}

			const lastMessage = lastMessagesMap.get(chat.conversationId)
			return {
				id: chatId,
				name: title,
				isPinned: chat.isPinned,
				lastMessage: lastMessage
					? {
							...lastMessage,
							chatId: chatId?.toString() || '',
							isRead: true,
							files: lastMessage.files?.map((f) => ({ ...f, size: f.size.toString() })) || []
						}
					: undefined
			}
		})

		return plainToInstance(ChatResponseDto, chatsWithTitle)
	}

	async create(
		tx: Prisma.TransactionClient,
		userId: UserId,
		conversationId: number,
		targetId?: bigint
	): Promise<ChatResponseDto> {
		const chat = await tx.chat.upsert({
			where: {
				userId_conversationId: { userId, conversationId }
			},
			update: { targetId },
			create: { userId, conversationId, targetId }
		})

		return plainToInstance(ChatResponseDto, chat)
	}

	async resolveConversation(
		tx: Prisma.TransactionClient,
		userId: UserId,
		chatId: ChatId
	): Promise<{
		conversationId: number
		conversationType: ConversationType
		ownerId: bigint
		chatType: ChatType
	}> {
		const chatType = detectChatType(chatId)
		const now = Date.now()

		if (chatType === ChatType.PRIVATE) {
			const targetUserId = chatId as bigint
			const existing = await tx.conversation.findFirst({
				where: {
					type: ConversationType.DIRECT,
					members: {
						some: { userId: userId }
					},
					AND: [
						{ members: { some: { userId: targetUserId } } },
						{ members: { none: { userId: { notIn: [userId, targetUserId] } } } }
					]
				}
			})

			if (existing) {
				return {
					conversationId: existing.id,
					conversationType: existing.type,
					ownerId: targetUserId,
					chatType
				}
			}

			if (userId === targetUserId) {
				const selfConversation = await tx.conversation.create({
					data: {
						type: ConversationType.DIRECT,
						createdAt: now,
						isSelfConversation: true,
						members: {
							create: {
								userId: userId,
								joinedAt: now,
								role: 'MEMBER'
							}
						}
					}
				})

				return {
					conversationId: selfConversation.id,
					conversationType: selfConversation.type,
					ownerId: targetUserId,
					chatType
				}
			}

			// Check if target user exists
			const targetUser = await tx.user.findUnique({ where: { id: targetUserId } })
			if (!targetUser) {
				throw new NotFoundException('User not found or account deleted')
			}

			const created = await tx.conversation.create({
				data: {
					type: ConversationType.DIRECT,
					createdAt: now,
					members: {
						createMany: {
							data: [
								{ userId: userId, joinedAt: now, role: 'MEMBER' },
								{ userId: targetUserId, joinedAt: now, role: 'MEMBER' }
							]
						}
					}
				}
			})

			return {
				conversationId: created.id,
				conversationType: created.type,
				ownerId: targetUserId,
				chatType
			}
		}

		if (chatType === ChatType.GROUP) {
			let conversation = await tx.conversation.findUnique({
				where: { groupId: chatId },
				include: { group: { select: { ownerId: true } } }
			})

			if (!conversation) {
				const group = await tx.group.findUnique({ where: { id: chatId } })
				if (!group) throw new NotFoundException('Group not found')

				conversation = await tx.conversation.create({
					data: {
						type: ConversationType.GROUP,
						groupId: chatId,
						createdAt: now
					},
					include: { group: { select: { ownerId: true } } }
				})
			}

			return {
				conversationId: conversation.id,
				conversationType: conversation.type,
				ownerId: conversation.group?.ownerId || BigInt(0),
				chatType
			}
		}

		if (chatType === ChatType.CHANNEL) {
			let conversation = await tx.conversation.findUnique({
				where: { channelId: chatId },
				include: { channel: { select: { ownerId: true } } }
			})

			if (!conversation) {
				const channel = await tx.channel.findUnique({ where: { id: chatId } })
				if (!channel) throw new NotFoundException('Channel not found')

				conversation = await tx.conversation.create({
					data: {
						type: ConversationType.CHANNEL,
						channelId: chatId,
						createdAt: now
					},
					include: { channel: { select: { ownerId: true } } }
				})
			}

			return {
				conversationId: conversation.id,
				conversationType: conversation.type,
				ownerId: conversation.channel?.ownerId || BigInt(0),
				chatType
			}
		}

		throw new Error('Unsupported chat type')
	}

	async findConversationByChatId(chatId: ChatId, userId: UserId) {
		const chatType = detectChatType(chatId)

		if (chatType === ChatType.PRIVATE) {
			const conversation = await this.prisma.conversation.findFirst({
				where: {
					type: ConversationType.DIRECT,
					members: {
						some: { userId: userId }
					},
					AND: [
						{ members: { some: { userId: chatId as bigint } } },
						{ members: { none: { userId: { notIn: [userId, chatId as bigint] } } } }
					]
				}
			})

			if (!conversation) {
				throw new NotFoundException('Conversation not found')
			}

			return conversation
		}

		if (chatType === ChatType.GROUP) {
			const conversation = await this.prisma.conversation.findUnique({
				where: { groupId: chatId }
			})

			if (!conversation) {
				throw new NotFoundException('Conversation not found')
			}

			return conversation
		}

		if (chatType === ChatType.CHANNEL) {
			const conversation = await this.prisma.conversation.findUnique({
				where: { channelId: chatId }
			})

			if (!conversation) {
				throw new NotFoundException('Conversation not found')
			}

			return conversation
		}

		throw new NotFoundException('Unsupported chat type')
	}

	async canReadChat(userId: UserId, chatId: ChatId): Promise<boolean> {
		const chatType = detectChatType(chatId)

		if (chatType === ChatType.PRIVATE) {
			const conversation = await this.prisma.conversation.findFirst({
				where: {
					type: ConversationType.DIRECT,
					members: {
						some: { userId: userId }
					},
					AND: [
						{ members: { some: { userId: chatId as bigint } } },
						{ members: { none: { userId: { notIn: [userId, chatId as bigint] } } } }
					]
				}
			})

			if (!conversation) {
				throw new ForbiddenException('User is not a chat participant')
			}

			return true
		}

		if (chatType === ChatType.GROUP) {
			const member = await this.prisma.groupMember.findFirst({
				where: {
					groupId: chatId,
					userId
				}
			})

			if (!member) {
				throw new ForbiddenException('User is not a group member')
			}

			return true
		}

		if (chatType === ChatType.CHANNEL) {
			const channel = await this.prisma.channel.findUnique({
				where: { id: chatId },
				select: { channelType: true, ownerId: true }
			})

			if (!channel) {
				throw new NotFoundException('Channel not found')
			}

			if (channel.channelType === 'PUBLIC') {
				return true
			}

			const subscriber = await this.prisma.channelSubscriber.findFirst({
				where: {
					channelId: chatId,
					userId
				}
			})

			if (subscriber) {
				return true
			}

			if (channel.ownerId !== userId) {
				throw new ForbiddenException('User is not a channel member')
			}

			return true
		}

		throw new ForbiddenException('Unsupported chat type')
	}

	async canReadMessage(userId: UserId, messageId: number, chatId?: ChatId): Promise<boolean> {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			include: { conversation: true }
		})

		if (!message) {
			throw new NotFoundException('Message not found')
		}

		const conversation = message.conversation

		if (chatId) {
			const chatType = detectChatType(chatId)
			let matches = false

			if (chatType === ChatType.PRIVATE) {
				const otherMember = await this.prisma.conversationMember.findFirst({
					where: {
						conversationId: conversation.id,
						userId: { not: userId }
					}
				})
				const otherUserId = otherMember?.userId ?? userId
				matches = otherUserId === ChatId(chatId)
			} else if (chatType === ChatType.GROUP) {
				matches = conversation.groupId === (chatId as bigint)
			} else if (chatType === ChatType.CHANNEL) {
				matches = conversation.channelId === (chatId as bigint)
			}

			if (!matches) {
				throw new ForbiddenException('Message does not belong to the specified chat')
			}
		}

		if (conversation.type === ConversationType.DIRECT) {
			const member = await this.prisma.conversationMember.findFirst({
				where: {
					conversationId: conversation.id,
					userId
				}
			})

			if (!member) {
				throw new ForbiddenException('User is not a chat participant')
			}

			return true
		}

		if (conversation.type === ConversationType.GROUP) {
			const member = await this.prisma.groupMember.findFirst({
				where: {
					groupId: conversation.groupId,
					userId
				}
			})

			if (!member) {
				throw new ForbiddenException('User is not a group member')
			}

			return true
		}

		if (conversation.type === ConversationType.CHANNEL) {
			if (!conversation.channelId) {
				throw new NotFoundException('Channel not found')
			}

			const channel = await this.prisma.channel.findUnique({
				where: { id: conversation.channelId },
				select: { channelType: true, ownerId: true }
			})

			if (!channel) {
				throw new NotFoundException('Channel not found')
			}

			if (channel.channelType === 'PUBLIC') {
				return true
			}

			const subscriber = await this.prisma.channelSubscriber.findFirst({
				where: {
					channelId: conversation.channelId,
					userId
				}
			})

			if (subscriber) {
				return true
			}

			if (channel.ownerId !== userId) {
				throw new ForbiddenException('User is not a channel member')
			}

			return true
		}

		throw new ForbiddenException('Unsupported chat type')
	}

	async getById(userId: UserId, chatId: ChatId): Promise<ChatResponseDto> {
		const conversation = await this.findConversationByChatId(chatId, userId)

		const chat = await this.prisma.chat.findUnique({
			where: {
				userId_conversationId: {
					userId: userId,
					conversationId: conversation.id
				}
			},
			include: {
				conversation: {
					include: {
						group: true,
						channel: true
					}
				}
			}
		})

		if (!chat) {
			throw new NotFoundException('Chat not found')
		}

		let title = ''
		let resolvedChatId: bigint | null = null

		switch (chat.conversation.type) {
			case ConversationType.DIRECT: {
				resolvedChatId = chat.targetId || userId
				const otherMember = await this.prisma.conversationMember.findFirst({
					where: {
						conversationId: chat.conversationId,
						userId: resolvedChatId
					},
					include: {
						user: {
							select: {
								id: true,
								firstName: true,
								lastName: true
							}
						}
					}
				})

				if (otherMember) {
					title = `${otherMember.user.firstName ?? ''} ${otherMember.user.lastName ?? ''}`.trim()
				} else if (chat.conversation.isSelfConversation) {
					title = 'Saved messages'
				} else {
					title = 'Deleted User'
				}
				break
			}
			case ConversationType.CHANNEL: {
				if (chat.conversation.channel) {
					resolvedChatId = chat.conversation.channelId
					title = chat.conversation.channel.name
				}
				break
			}
			case ConversationType.GROUP: {
				if (chat.conversation.group) {
					resolvedChatId = chat.conversation.groupId
					title = chat.conversation.group.name
				}
				break
			}
		}

		const lastMessage = await this.getLastMessage(chat.conversationId)
		if (lastMessage && resolvedChatId) {
			lastMessage.chatId = resolvedChatId.toString()
		}

		return plainToInstance(ChatResponseDto, {
			id: resolvedChatId,
			name: title,
			isPinned: chat.isPinned,
			lastMessage: lastMessage
		})
	}

	async deleteChat(userId: UserId, chatId: ChatId): Promise<void> {
		const conversation = await this.findConversationByChatId(chatId, userId)

		await this.prisma.$transaction(async (tx) => {
			// 1. Delete the user's chat record
			await tx.chat.deleteMany({
				where: { userId, conversationId: conversation.id }
			})

			// 2. Delete the user's membership
			await tx.conversationMember.deleteMany({
				where: { userId, conversationId: conversation.id }
			})

			// 3. Check if there are any members left in this conversation
			const membersCount = await tx.conversationMember.count({
				where: { conversationId: conversation.id }
			})

			if (membersCount === 0) {
				// 4. If no members left, delete the conversation and all its messages
				// Messages and files will be deleted by Cascade
				await tx.conversation.delete({
					where: { id: conversation.id }
				})
			}
		})
	}

	private async getLastMessage(conversationId: number): Promise<MessageResponseDto | null> {
		const message = await this.prisma.message.findFirst({
			where: { conversationId },
			orderBy: { sendTime: 'desc' },
			include: { files: true }
		})

		if (!message) return null

		return plainToInstance(MessageResponseDto, {
			...message,
			files: message.files.map((f) => ({ ...f, size: f.size.toString() }))
		})
	}
}

import { plainToInstance } from 'class-transformer'
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { GroupId } from 'src/common/types/group-id.type'
import { UserId } from 'src/common/types/user-id.type'
import { CreateGroupDto } from './dto/create-group.dto'
import { generateGroupId } from 'src/common/utils/id-generator.util'
import { GroupResponseDto } from './dto/group-response.dto'
import { UpdateGroupDto } from './dto/update-group.dto'
import { ChatsService } from '../chats/chats.service'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { ConversationRole, ConversationType, GroupType, Prisma } from 'generated/prisma/client'
import { SearchService } from '../search/search.service'
import { UserResponseDto } from '../users/dto/user-response.dto'

@Injectable()
export class GroupsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly chatsService: ChatsService,
        private readonly searchService: SearchService
    ) { }

    async create(ownerId: UserId, dto: CreateGroupDto): Promise<GroupResponseDto> {
        if (dto.username) {
            const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
            if (!isAvailable) throw new ConflictException('Username is already taken')
        }

        const groupId = generateGroupId()

        const group = await this.prisma.$transaction(async tx => {
            const group = await tx.group.create({
                data: {
                    id: groupId,
                    name: dto.name,
                    username: dto.username,
                    ownerId: ownerId,
                    bio: dto.bio,
                    groupType: dto.groupType || GroupType.PRIVATE
                }
            })

            await tx.groupMember.create({
                data: {
                    userId: ownerId,
                    groupId: group.id
                }
            })

            const conversation = await tx.conversation.create({
                data: {
                    type: ConversationType.GROUP,
                    groupId: group.id,
                    createdAt: Date.now()
                }
            })

            await tx.conversationMember.create({
                data: {
                    conversationId: conversation.id,
                    userId: ownerId,
                    role: ConversationRole.OWNER,
                    joinedAt: Date.now()
                }
            })

            await this.chatsService.create(tx, ownerId, conversation.id)

            return group
        })

        return plainToInstance(GroupResponseDto, { ...group, isMember: true, isOwner: true, membersCount: 1 })
    }

    async update(id: GroupId, dto: UpdateGroupDto, userId: UserId): Promise<GroupResponseDto> {
        const existingGroup = await this.prisma.group.findUnique({ where: { id } })

        if (dto.username && dto.username !== existingGroup!.username) {
            const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
            if (!isAvailable) throw new ConflictException('Username is already taken')
        }

        const group = await this.prisma.group.update({
            where: { id },
            data: {
                name: dto.name,
                bio: dto.bio,
                username: dto.username,
                groupType: dto.groupType
            }
        })
        return plainToInstance(GroupResponseDto, group)
    }

    async join(id: GroupId, userId: UserId): Promise<void> {
        const group = await this.prisma.group.findUnique({
            where: { id },
            include: { conversations: true }
        })

        if (group!.groupType !== GroupType.PUBLIC) {
            throw new BadRequestException('This group is private. Use invite link to join.')
        }

        const isBanned = await this.prisma.groupBlackList.count({
            where: { groupId: id, userId }
        })
        if (isBanned) throw new BadRequestException('You are banned from this group')

        const conversation = group!.conversations[0]
        if (!conversation) throw new NotFoundException('Group conversation not found')

        await this.prisma.$transaction(async tx => {
            const existingMember = await tx.groupMember.findUnique({
                where: { groupId_userId: { groupId: id, userId } }
            })
            if (existingMember) return

            await tx.groupMember.create({ data: { groupId: id, userId } })
            await tx.conversationMember.create({
                data: {
                    conversationId: conversation.id,
                    userId,
                    joinedAt: Date.now()
                }
            })
            await this.chatsService.create(tx, userId, conversation.id)
        })
    }

    async leave(id: GroupId, userId: UserId): Promise<void> {
        const group = await this.prisma.group.findUnique({
            where: { id },
            include: { conversations: true }
        })
        if (group!.ownerId === userId) throw new BadRequestException('Owner cannot leave group. Delete it instead.')

        const conversation = group!.conversations[0]

        await this.prisma.$transaction(async tx => {
            await tx.groupMember.delete({
                where: { groupId_userId: { groupId: id, userId } }
            }).catch(() => { })

            if (conversation) {
                await tx.conversationMember.delete({
                    where: { conversationId_userId: { conversationId: conversation.id, userId } }
                }).catch(() => { })

                await tx.chat.deleteMany({
                    where: { userId, conversationId: conversation.id }
                })
            }
        })
    }

    async kick(id: GroupId, ownerId: UserId, targetUserId: UserId): Promise<void> {
        if (targetUserId === ownerId) throw new BadRequestException('Cannot kick yourself')

        await this.leave(id, targetUserId)
    }

    async ban(id: GroupId, ownerId: UserId, targetUserId: UserId): Promise<void> {
        if (targetUserId === ownerId) throw new BadRequestException('Cannot ban yourself')

        await this.prisma.$transaction(async tx => {
            await this.kick(id, ownerId, targetUserId)
            await tx.groupBlackList.upsert({
                where: { userId_groupId: { userId: targetUserId, groupId: id } },
                create: { userId: targetUserId, groupId: id },
                update: {}
            })
        })
    }

    async getById(id: GroupId, userId?: UserId): Promise<GroupResponseDto> {
        const group = await this.prisma.group.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { members: true }
                },
                members: userId ? {
                    where: { userId },
                    select: { userId: true }
                } : undefined
            }
        })

        const isMember = userId ? group!.members.length > 0 : false
        const isOwner = userId ? group!.ownerId === userId : false

        return plainToInstance(GroupResponseDto, {
            ...group,
            membersCount: group!._count.members,
            isMember,
            isOwner
        })
    }

    async getMembers(id: GroupId, skip: number, take: number, search?: string): Promise<UserResponseDto[]> {
        const where: Prisma.GroupMemberWhereInput = {
            groupId: id,
            user: search ? {
                OR: [
                    { firstName: { contains: search } },
                    { lastName: { contains: search } },
                    { username: { contains: search } }
                ]
            } : undefined
        }

        const members = await this.prisma.groupMember.findMany({
            where,
            skip,
            take,
            include: {
                user: true
            },
            orderBy: {
                user: {
                    firstName: 'asc'
                }
            }
        })

        return plainToInstance(UserResponseDto, members.map(m => m.user))
    }

    async delete(id: GroupId, userId: UserId): Promise<void> {
        await this.prisma.group.delete({ where: { id } })
    }

    async isExists(id: GroupId): Promise<boolean> {
        return await this.prisma.group.count({ where: { id } }) > 0
    }

    async isOwner(groupId: GroupId, userId: UserId): Promise<boolean> {
        const count = await this.prisma.group.count({
            where: { id: groupId, ownerId: userId }
        })

        return count > 0
    }
}

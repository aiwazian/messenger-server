import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { SearchResponseDto } from './dto/search-response.dto'
import { ChatId } from 'src/common/types/chat-id.type'
import { plainToInstance } from 'class-transformer'
import { SearchQueryDto } from './dto/search-query.dto'

@Injectable()
export class SearchService {
    constructor(private readonly prisma: PrismaService) { }

    async isUsernameAvailable(username: string): Promise<boolean> {
        // Use Promise.all for parallel queries instead of sequential
        const [userCount, groupCount, channelCount] = await Promise.all([
            this.prisma.user.count({ where: { username } }),
            this.prisma.group.count({ where: { username } }),
            this.prisma.channel.count({ where: { username } })
        ])

        return userCount === 0 && groupCount === 0 && channelCount === 0
    }

    async search(dto: SearchQueryDto): Promise<SearchResponseDto[]> {
        const query = dto.q

        const [users, channels, groups] = await Promise.all([
            this.prisma.user.findMany({
                where: {
                    OR: [
                        { firstName: { contains: query } },
                        { lastName: { contains: query } },
                        { username: { contains: query } }
                    ]
                }
            }),
            this.prisma.channel.findMany({
                where: {
                    OR: [
                        { name: { contains: query } },
                        { username: { contains: query } }
                    ]
                }
            }),
            this.prisma.group.findMany({
                where: {
                    OR: [
                        { name: { contains: query } },
                        { username: { contains: query } }
                    ]
                }
            })
        ])

        const userResults: SearchResponseDto[] = users.map(user => ({
            chatId: ChatId(user.id),
            name: `${user.firstName} ${user.lastName || ''}`.trim()
        }))

        const channelResults: SearchResponseDto[] = channels.map(channel => ({
            chatId: ChatId(channel.id),
            name: channel.name
        }))

        const groupResults: SearchResponseDto[] = groups.map(group => ({
            chatId: ChatId(group.id),
            name: group.name
        }))

        return plainToInstance(SearchResponseDto, [...userResults, ...channelResults, ...groupResults])
    }
}

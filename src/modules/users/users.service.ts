import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserId } from 'src/common/types/user-id.type'
import { plainToInstance } from 'class-transformer'
import { UserResponseDto } from './dto/user-response.dto'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { SearchService } from '../search/search.service'
import { PrivacySettingsDto } from './dto/privacy-settings.dto'
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto'
import { hashPassword, verifyPassword } from 'src/common/utils/password.util'
import { ChangePasswordDto } from './dto/change-password.dto'

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly searchService: SearchService
    ) { }

    async changePassword(id: UserId, dto: ChangePasswordDto): Promise<void> {
        const user = await this.prisma.user.findUnique({ where: { id } })
        if (!user) throw new NotFoundException('User not found')

        const passwordHash = await hashPassword(dto.password)
        await this.prisma.user.update({
            where: { id },
            data: { password: passwordHash }
        })
    }

    async updateUser(id: UserId, dto: UpdateUserDto): Promise<UserResponseDto> {
        const user = await this.prisma.user.findUnique({ where: { id } })
        if (!user) throw new NotFoundException('User not found')

        if (dto.username && dto.username !== user.username) {
            const isAvailable = await this.searchService.isUsernameAvailable(dto.username)
            if (!isAvailable) throw new ConflictException('Username is already taken')
        }

        const updatedUser = await this.prisma.user.update({
            where: { id: id },
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName || null,
                username: dto.username || null,
                bio: dto.bio || null,
                dateOfBirth: dto.dateOfBirth || null
            }
        })

        return plainToInstance(UserResponseDto, updatedUser)
    }

    async getById(id: UserId, currentUserId?: UserId): Promise<UserResponseDto> {
        const user = await this.prisma.user.findUnique({
            where: { id: id },
            include: { privacySettings: true }
        })

        if (!user) throw new NotFoundException('User not found')

        const response = plainToInstance(UserResponseDto, user)

        if (currentUserId && currentUserId !== id) {
            const privacy = user.privacySettings
            if (privacy) {
                if (privacy.bio === 1) {
                    response.bio = null
                }
                if (privacy.dateOfBirth === 1) {
                    response.dateOfBirth = null
                }
            }
        }

        return response
    }

    async getPrivacySettings(userId: UserId): Promise<PrivacySettingsDto> {
        const settings = await this.prisma.privacySettings.findUnique({
            where: { userId }
        })
        if (!settings) {
            return plainToInstance(PrivacySettingsDto, {
                lastSeen: 0,
                messages: 0,
                bio: 0,
                dateOfBirth: 0,
                invites: 0
            })
        }
        return plainToInstance(PrivacySettingsDto, settings)
    }

    async updatePrivacySettings(userId: UserId, dto: UpdatePrivacySettingsDto): Promise<PrivacySettingsDto> {
        const settings = await this.prisma.privacySettings.upsert({
            where: { userId },
            update: dto,
            create: {
                userId,
                lastSeen: dto.lastSeen ?? 0,
                messages: dto.messages ?? 0,
                bio: dto.bio ?? 0,
                dateOfBirth: dto.dateOfBirth ?? 0,
                invites: dto.invites ?? 0
            }
        })
        return plainToInstance(PrivacySettingsDto, settings)
    }

    async isExists(id: UserId): Promise<boolean> {
        return await this.prisma.user.count({ where: { id } }) > 0
    }
}

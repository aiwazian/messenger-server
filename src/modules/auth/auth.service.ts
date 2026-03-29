import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { SigninDto } from './dto/signin.dto'
import { SignupDto } from './dto/signup.dto'
import { generateUserId } from 'src/common/utils/id-generator.util'
import { SessionsService } from '../sessions/sessions.service'
import { Prisma, SenderType } from '../../../generated/prisma/client'
import { hashPassword, verifyPassword } from 'src/common/utils/password.util'
import { UserId } from 'src/common/types/user-id.type'
import { AuthResponseDto } from './dto/auth-response.dto'
import { JwtAuthService } from 'src/modules/security/jwt.service'
import { plainToInstance } from 'class-transformer'
import { LoginAvailableDto } from './dto/check-login.dto'
import { PrismaService } from 'src/providers/prisma/prisma.service'

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly sessionService: SessionsService,
		private readonly jwtAuth: JwtAuthService
	) {}

	async isLoginAvailable(login: string): Promise<LoginAvailableDto> {
		const user = await this.prisma.user.findUnique({
			where: { login: login }
		})

		if (user) {
			throw new ConflictException('Login already exists')
		}

		return plainToInstance(LoginAvailableDto, { available: true })
	}

	async signin(dto: SigninDto): Promise<AuthResponseDto> {
		const user = await this.prisma.user.findUnique({
			where: { login: dto.login }
		})

		if (!user) throw new UnauthorizedException('Invalid credentials')

		const isValid = await verifyPassword(dto.password, user.password)
		if (!isValid) throw new UnauthorizedException('Invalid credentials')

		const userId = UserId(user.id)

		// Generate both access and refresh tokens
		const tokens = this.jwtAuth.generateTokenPair(userId)

		await this.sessionService.create({
			userId: userId,
			token: tokens.accessToken,
			deviceModel: dto.deviceModel,
			osVersion: dto.osVersion,
			osName: dto.osName
		})

		return plainToInstance(AuthResponseDto, { token: tokens.accessToken, userId: userId })
	}

	async signup(dto: SignupDto): Promise<void> {
		const userId = generateUserId()
		const passwordHash = await hashPassword(dto.password)

		try {
			await this.prisma.$transaction([
				this.prisma.user.create({
					data: {
						id: userId,
						login: dto.login,
						password: passwordHash
					}
				}),
				this.prisma.sender.create({
					data: {
						id: userId,
						type: SenderType.USER,
						userId: userId
					}
				}),
				this.prisma.privacySettings.create({
					data: {
						userId: userId,
						lastSeen: 0,
						messages: 0,
						bio: 0,
						dateOfBirth: 0,
						invites: 0
					}
				})
			])
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === 'P2002') {
					throw new ConflictException('User with this login already exists')
				}
			}
			throw error
		}
	}
}

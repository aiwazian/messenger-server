import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { SigninDto } from './dto/signin.dto'
import { SignupDto } from './dto/signup.dto'
import { SessionsService } from '../sessions/sessions.service'
import { Prisma, PrivacyRule } from '../../../generated/prisma/client'
import { AuthResponseDto } from './dto/auth-response.dto'
import { plainToInstance } from 'class-transformer'
import { LoginAvailableDto } from './dto/check-login.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { JwtAuthService } from '../security/jwt.service'
import { hashPassword, verifyPassword } from '../../common/utils/password.util'
import { UserId } from '../../common/types/user-id.type'
import { generateUserId } from '../../common/utils/id-generator.util'
import { CreateSessionDto } from '../sessions/dto/create-session.dto'

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly sessionService: SessionsService,
		private readonly jwtAuth: JwtAuthService
	) { }

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

		const tokens = this.jwtAuth.generateTokenPair(userId)

		const session = await this.sessionService.create(
			plainToInstance(CreateSessionDto, {
				userId: userId,
				token: tokens.accessToken,
				deviceModel: dto.deviceModel,
				osVersion: dto.osVersion,
				osName: dto.osName
			})
		)

		return plainToInstance(AuthResponseDto, {
			token: tokens.accessToken,
			userId: userId,
			createdAt: session.createdAt
		})
	}

	async signup(dto: SignupDto): Promise<AuthResponseDto> {
		const userId = generateUserId()
		const passwordHash = await hashPassword(dto.password)

		try {
			const user = await this.prisma.user.create({
				data: {
					id: userId,
					firstName: dto.firstName,
					lastName: dto.lastName,
					login: dto.login,
					password: passwordHash,
					privacySettings: {
						create: {
							lastSeen: PrivacyRule.EVERYBODY,
							messages: PrivacyRule.EVERYBODY,
							bio: PrivacyRule.EVERYBODY,
							dateOfBirth: PrivacyRule.EVERYBODY,
							invites: PrivacyRule.EVERYBODY
						}
					}
				}
			})

			const tokens = this.jwtAuth.generateTokenPair(UserId(user.id))

			const session = await this.sessionService.create(
				plainToInstance(CreateSessionDto, {
					userId: user.id,
					token: tokens.accessToken,
					deviceModel: dto.deviceModel,
					osVersion: dto.osVersion,
					osName: dto.osName
				})
			)

			return plainToInstance(AuthResponseDto, {
				token: tokens.accessToken,
				userId: userId,
				createdAt: session.createdAt
			})
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

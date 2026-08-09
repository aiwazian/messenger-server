import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
import { SigninDto } from './dto/signin.dto'
import { SignupDto } from './dto/signup.dto'
import { SessionsService } from '../sessions/sessions.service'
import { Prisma, PrivacyRule } from '../../generated/prisma/client'
import { AuthResponseDto } from './dto/auth-response.dto'
import { plainToInstance } from 'class-transformer'
import { LoginAvailableDto } from './dto/check-login.dto'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { hashPassword, verifyPassword } from '../../common/utils/password.util'
import { UserId } from '../../common/types/user-id.type'
import { generateUserId } from '../../common/utils/id-generator.util'
import { CreateSessionDto } from '../sessions/dto/create-session.dto'
import { EmailVerificationStore } from '../users/email-verification.store'
import { MailService } from '../mail/mail.service'
import { RequestPasswordResetDto } from './dto/request-password-reset.dto'
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly sessionService: SessionsService,
		private readonly emailVerificationStore: EmailVerificationStore,
		private readonly mailService: MailService
	) {}

	async isLoginAvailable(login: string): Promise<LoginAvailableDto> {
		const user = await this.prisma.user.findUnique({
			where: { login: login }
		})

		if (user) {
			return plainToInstance(LoginAvailableDto, {
				available: false,
				canReset: !!user.email
			})
		}

		return plainToInstance(LoginAvailableDto, { available: true, canReset: false })
	}

	async signin(dto: SigninDto): Promise<AuthResponseDto> {
		const user = await this.prisma.user.findUnique({
			where: { login: dto.login }
		})

		if (!user) throw new UnauthorizedException('Invalid credentials')

		const isValid = await verifyPassword(dto.password, user.password)
		if (!isValid) throw new UnauthorizedException('Invalid credentials')

		const userId = UserId(user.id)

		const { session, token } = await this.sessionService.create(
			plainToInstance(CreateSessionDto, {
				userId: userId,
				deviceModel: dto.deviceModel,
				osVersion: dto.osVersion,
				osName: dto.osName
			})
		)

		return plainToInstance(AuthResponseDto, {
			token: token,
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

			const { session, token } = await this.sessionService.create(
				plainToInstance(CreateSessionDto, {
					userId: user.id,
					deviceModel: dto.deviceModel,
					osVersion: dto.osVersion,
					osName: dto.osName
				})
			)

			return plainToInstance(AuthResponseDto, {
				token: token,
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

	async requestPasswordReset(dto: RequestPasswordResetDto): Promise<void> {
		const user = await this.prisma.user.findUnique({
			where: { login: dto.login }
		})

		if (!user) {
			throw new NotFoundException('User not found')
		}

		if (!user.email) {
			throw new BadRequestException('User has no email')
		}

		const code = this.emailVerificationStore.generateCode(user.id, user.email)
		await this.mailService.sendPasswordResetEmail(user.email, code)
	}

	async verifyResetCode(dto: VerifyResetCodeDto): Promise<{ valid: boolean }> {
		const user = await this.prisma.user.findUnique({
			where: { login: dto.login }
		})

		if (!user) {
			throw new NotFoundException('User not found')
		}

		const result = this.emailVerificationStore.validate(user.id, dto.code)

		return { valid: result.valid }
	}

	async resetPassword(dto: ResetPasswordDto): Promise<AuthResponseDto> {
		const user = await this.prisma.user.findUnique({
			where: { login: dto.login }
		})

		if (!user) {
			throw new NotFoundException('User not found')
		}

		const result = this.emailVerificationStore.consume(user.id, dto.code)
		if (!result.valid) {
			throw new UnauthorizedException('Invalid or expired code')
		}

		const passwordHash = await hashPassword(dto.newPassword)

		await this.prisma.user.update({
			where: { id: user.id },
			data: { password: passwordHash }
		})

		const userId = UserId(user.id)

		/*
		 * Смена пароля завершает все прежние сессии: токен бессрочный, поэтому
		 * тот, из-за кого пароль пришлось сбрасывать, иначе остался бы в аккаунте
		 * со своим токеном.
		 */
		await this.sessionService.deleteAll(userId)

		const { session, token } = await this.sessionService.create(
			plainToInstance(CreateSessionDto, {
				userId: userId,
				deviceModel: dto.deviceModel ?? 'Unknown',
				osVersion: dto.osVersion ?? 'Unknown',
				osName: dto.osName ?? 'Unknown'
			})
		)

		return plainToInstance(AuthResponseDto, {
			token: token,
			userId: userId,
			createdAt: session.createdAt
		})
	}
}

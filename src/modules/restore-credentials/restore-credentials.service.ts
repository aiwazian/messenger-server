import {
	BadRequestException,
	Inject,
	Injectable,
	ServiceUnavailableException,
	UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'
import { plainToInstance } from 'class-transformer'
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/server'
import { REDIS_CLIENT } from '../../providers/redis/redis.module'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { SessionsService } from '../sessions/sessions.service'
import { CreateSessionDto } from '../sessions/dto/create-session.dto'
import { AuthResponseDto } from '../auth/dto/auth-response.dto'
import { UserId } from '../../common/types/user-id.type'
import { RestoreRegistrationRequestDto } from './dto/restore-registration-request.dto'
import { RestoreAuthenticationRequestDto } from './dto/restore-authentication-request.dto'

const RP_NAME = 'Messenger'

const CHALLENGE_TTL_SECONDS = 120

const REGISTRATION_CHALLENGE_PREFIX = 'restore-credentials:registration-challenge'

const AUTHENTICATION_CHALLENGE_PREFIX = 'restore-credentials:authentication-challenge'

@Injectable()
export class RestoreCredentialsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly sessionsService: SessionsService,
		@Inject(REDIS_CLIENT) private readonly redis: Redis,
		private readonly configService: ConfigService
	) {}

	async getRegistrationOptions(
		token: string
	): Promise<{ options: PublicKeyCredentialCreationOptionsJSON }> {
		const rpId = this.getRpId()

		const session = await this.sessionsService.findByToken(token)
		if (!session) {
			throw new UnauthorizedException('Invalid token')
		}

		const user = await this.prisma.user.findUnique({
			where: { id: session.userId }
		})

		if (!user) {
			throw new UnauthorizedException('Invalid token')
		}

		const options = await generateRegistrationOptions({
			rpName: RP_NAME,
			rpID: rpId,
			userID: this.userIdBytes(user.id),
			userName: user.login,
			attestationType: 'none',
			authenticatorSelection: {
				residentKey: 'discouraged',
				userVerification: 'preferred'
			}
		})

		await this.redis.set(
			this.registrationChallengeKey(BigInt(session.userId)),
			options.challenge,
			'EX',
			CHALLENGE_TTL_SECONDS
		)

		return { options }
	}

	async register(
		token: string,
		dto: RestoreRegistrationRequestDto
	): Promise<{ registered: boolean }> {
		const session = await this.sessionsService.findByToken(token)
		if (!session) {
			throw new UnauthorizedException('Invalid token')
		}

		let response: RegistrationResponseJSON
		try {
			response = JSON.parse(dto.registrationJson) as RegistrationResponseJSON
		} catch {
			throw new BadRequestException('Invalid registration response')
		}

		const challengeKey = this.registrationChallengeKey(BigInt(session.userId))
		const expectedChallenge = await this.redis.get(challengeKey)

		if (!expectedChallenge) {
			throw new UnauthorizedException('Registration challenge expired')
		}

		try {
			const verification = await verifyRegistrationResponse({
				response: response,
				expectedChallenge: expectedChallenge,
				expectedOrigin: this.getExpectedOrigins(),
				expectedRPID: this.getRpId(),
				requireUserVerification: false
			})

			if (!verification.verified) {
				throw new UnauthorizedException('Restore credential verification failed')
			}

			const credential = verification.registrationInfo.credential

			await this.prisma.restoreCredential.upsert({
				where: { credentialId: credential.id },
				create: {
					userId: session.userId,
					sessionId: session.id,
					credentialId: credential.id,
					publicKey: Buffer.from(credential.publicKey),
					counter: credential.counter,
					createdAt: Date.now()
				},
				update: {
					sessionId: session.id,
					publicKey: Buffer.from(credential.publicKey),
					counter: credential.counter
				}
			})
		} finally {
			await this.redis.del(challengeKey)
		}

		return { registered: true }
	}

	async getAuthenticationOptions(): Promise<{ options: PublicKeyCredentialRequestOptionsJSON }> {
		const options = await generateAuthenticationOptions({
			rpID: this.getRpId(),
			userVerification: 'preferred'
		})

		await this.redis.set(
			this.authenticationChallengeKey(options.challenge),
			'1',
			'EX',
			CHALLENGE_TTL_SECONDS
		)

		return { options }
	}

	async authenticate(dto: RestoreAuthenticationRequestDto): Promise<AuthResponseDto> {
		let response: AuthenticationResponseJSON
		try {
			response = JSON.parse(dto.assertionJson) as AuthenticationResponseJSON
		} catch {
			throw new BadRequestException('Invalid authentication response')
		}

		const record = await this.prisma.restoreCredential.findUnique({
			where: { credentialId: response.id }
		})

		if (!record) {
			throw new UnauthorizedException('Restore credential not found')
		}

		const verification = await verifyAuthenticationResponse({
			response: response,
			expectedChallenge: async (challenge: string) => {
				const key = this.authenticationChallengeKey(challenge)
				const stored = await this.redis.get(key)
				if (!stored) {
					return false
				}
				await this.redis.del(key)
				return true
			},
			expectedOrigin: this.getExpectedOrigins(),
			expectedRPID: this.getRpId(),
			credential: {
				id: record.credentialId,
				publicKey: new Uint8Array(record.publicKey),
				counter: record.counter
			},
			requireUserVerification: false
		})

		if (!verification.verified) {
			throw new UnauthorizedException('Restore credential verification failed')
		}

		await this.prisma.restoreCredential.update({
			where: { id: record.id },
			data: {
				counter: verification.authenticationInfo.newCounter,
				lastUsedAt: Date.now()
			}
		})

		const userId = UserId(record.userId)

		const { session, token } = await this.sessionsService.create(
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

	private getRpId(): string {
		const rpId = this.configService.get<string>('WEBAUTHN_RP_ID')

		if (!rpId) {
			throw new ServiceUnavailableException('Restore credentials are not configured')
		}

		return rpId
	}

	private getExpectedOrigins(): string[] {
		const raw = this.configService.get<string>('WEBAUTHN_EXPECTED_ORIGINS') ?? ''
		const origins = raw
			.split(',')
			.map((origin) => origin.trim())
			.filter(Boolean)

		if (origins.length === 0) {
			throw new ServiceUnavailableException('Restore credentials are not configured')
		}

		return origins
	}

	private userIdBytes(id: bigint): Uint8Array<ArrayBuffer> {
		const buffer = new ArrayBuffer(8)
		const view = new DataView(buffer)
		view.setBigUint64(0, id)
		return new Uint8Array(buffer)
	}

	private registrationChallengeKey(userId: bigint): string {
		return `${REGISTRATION_CHALLENGE_PREFIX}:${userId.toString()}`
	}

	private authenticationChallengeKey(challenge: string): string {
		return `${AUTHENTICATION_CHALLENGE_PREFIX}:${challenge}`
	}
}

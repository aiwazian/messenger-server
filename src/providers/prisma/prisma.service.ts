import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { EncryptionService } from '../../modules/encryption/encryption.service'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
	private SYSTEM_USER_ID = 0n
	private readonly logger = new Logger(PrismaService.name)

	constructor(
		private readonly config: ConfigService,
		private readonly encryption: EncryptionService
	) {
		const adapter = new PrismaPg({
			connectionString: config.get('DATABASE_URL')
		})
		super({ adapter })
	}

	async onModuleInit() {
		await this.$connect()
		await this.ensureSystemUser()
		await this.ensureEncryptionKey()
	}

	private async ensureSystemUser() {
		await this.user.upsert({
			where: { id: this.SYSTEM_USER_ID },
			update: {
				id: this.SYSTEM_USER_ID,
				login: this.config.get("SYSTEM_USER_LOGIN")!,
				password: this.config.get("SYSTEM_USER_PASSWORD")!,
				firstName: this.config.get("SYSTEM_USER_NAME")!
			},
			create: {
				id: this.SYSTEM_USER_ID,
				login: this.config.get("SYSTEM_USER_LOGIN")!,
				password: this.config.get("SYSTEM_USER_PASSWORD")!,
				firstName: this.config.get("SYSTEM_USER_NAME")!
			}
		})
	}

	private async ensureEncryptionKey() {
		const version = this.encryption.currentVersion
		const existing = await this.encryptionKey.findUnique({
			where: { version }
		})

		if (!existing) {
			await this.encryptionKey.create({
				data: {
					version,
					createdAt: BigInt(Date.now())
				}
			})
			this.logger.log(`Encryption key version ${version} initialized`)
		}
	}
}

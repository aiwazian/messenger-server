import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '../../../generated/prisma/client'
import { EncryptionService } from '../../modules/encryption/encryption.service'


@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
	private SYSTEM_USER_ID = 0n
	private readonly logger = new Logger(PrismaService.name)

	constructor(
		private readonly config: ConfigService,
		private readonly encryption: EncryptionService
	) {
		const adapter = new PrismaBetterSqlite3({ url: config.get('DATABASE_URL') })
		super({ adapter })
	}

	async onModuleInit() {
		await this.$connect()
		await this.ensureSystemUser()
		await this.ensureEncryptionKey()
	}

	private async ensureSystemUser() {
		const existing = await this.user.findUnique({
			where: { id: this.SYSTEM_USER_ID }
		})

		if (!existing) {
			await this.user.create({
				data: {
					id: this.SYSTEM_USER_ID,
					login: '__system__',
					password: '__system__',
					firstName: 'System'
				}
			})
			this.logger.log('System user (id=0) created')
		}
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

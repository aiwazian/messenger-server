import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '../../../generated/prisma/client'

export const SYSTEM_USER_ID = 0n

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
	private readonly logger = new Logger(PrismaService.name)

	constructor(private readonly config: ConfigService) {
		const adapter = new PrismaBetterSqlite3({ url: config.get('DATABASE_URL') })
		super({ adapter })
	}

	async onModuleInit() {
		await this.$connect()
		await this.ensureSystemUser()
	}

	private async ensureSystemUser() {
		const existing = await this.user.findUnique({
			where: { id: SYSTEM_USER_ID }
		})

		if (!existing) {
			await this.user.create({
				data: {
					id: SYSTEM_USER_ID,
					login: '__system__',
					password: '__system__',
					firstName: 'System'
				}
			})
			this.logger.log('System user (id=0) created')
		}
	}
}

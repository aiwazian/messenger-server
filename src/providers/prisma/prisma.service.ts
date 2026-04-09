import { Injectable } from '@nestjs/common'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '../../../generated/prisma/client'

@Injectable()
export class PrismaService extends PrismaClient {
	constructor(private readonly config: ConfigService) {
		const adapter = new PrismaBetterSqlite3({ url: config.get('DATABASE_URL') })
		super({ adapter })
	}
}

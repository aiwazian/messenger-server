import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { EncryptionModule } from '../../modules/encryption/encryption.module'

@Global()
@Module({
	imports: [EncryptionModule],
	providers: [PrismaService],
	exports: [PrismaService]
})
export class PrismaModule {}

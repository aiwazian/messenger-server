import { Module } from '@nestjs/common'
import { InviteLinksService } from './invite-links.service'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from '../../providers/prisma/prisma.module'
import { ChatsService } from '../chats/chats.service'
import { EncryptionService } from '../encryption/encryption.service'

@Module({
	imports: [ConfigModule, PrismaModule],
	providers: [InviteLinksService, ChatsService, EncryptionService],
	exports: [InviteLinksService]
})
export class InvitesModule {}

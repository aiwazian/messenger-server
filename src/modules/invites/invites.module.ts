import { Module } from '@nestjs/common';
import { InviteLinksService } from './invite-links.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../providers/prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [InviteLinksService],
  exports: [InviteLinksService],
})
export class InvitesModule {}

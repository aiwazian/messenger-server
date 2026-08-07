import { Module } from '@nestjs/common'
import { ChatFoldersService } from './chat-folders.service'
import { ChatFoldersController } from './chat-folders.controller'
import { JwtAuthModule } from '../security/jwt.module'

@Module({
	imports: [JwtAuthModule],
	controllers: [ChatFoldersController],
	providers: [ChatFoldersService],
	exports: [ChatFoldersService]
})
export class ChatFoldersModule {}

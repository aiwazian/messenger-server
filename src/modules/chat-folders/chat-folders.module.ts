import { Module } from '@nestjs/common'
import { ChatFoldersService } from './chat-folders.service'
import { ChatFoldersController } from './chat-folders.controller'

@Module({
	controllers: [ChatFoldersController],
	providers: [ChatFoldersService],
	exports: [ChatFoldersService]
})
export class ChatFoldersModule {}

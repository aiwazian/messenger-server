import { Module } from '@nestjs/common'
import { StorageModule } from '../storage/storage.module'
import { EmojiController } from './emoji.controller'
import { EmojiService } from './emoji.service'

@Module({
	imports: [StorageModule],
	controllers: [EmojiController],
	providers: [EmojiService],
	exports: [EmojiService]
})
export class EmojiModule {}

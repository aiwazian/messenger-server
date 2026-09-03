import { Module } from '@nestjs/common'
import { StorageModule } from '../storage/storage.module'
import { StickersController } from './stickers.controller'
import { StickersService } from './stickers.service'

@Module({
	/*
	 * StorageModule нужен целиком: оттуда и форма загрузки картинки, и постоянные
	 * ссылки на неё, и отпускание файла после удаления стикера.
	 */
	imports: [StorageModule],
	controllers: [StickersController],
	providers: [StickersService],
	exports: [StickersService]
})
export class StickersModule {}

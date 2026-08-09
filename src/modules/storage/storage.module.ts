import { forwardRef, Module } from '@nestjs/common'
import { StorageService } from './storage.service'
import { SessionsModule } from '../sessions/sessions.module'

@Module({
	imports: [forwardRef(() => SessionsModule)],
	providers: [StorageService],
	exports: [StorageService]
})
export class StorageModule {}

import { forwardRef, Module } from '@nestjs/common'
import { StorageService } from './storage.service'
import { SessionsModule } from '../sessions/sessions.module'
import { OBJECT_STORAGE } from './ports/object-storage.port'
import { S3ObjectStorage } from './adapters/s3-object-storage.adapter'
import { FileRegistryService } from './services/file-registry.service'
import { UploadPolicyService } from './services/upload-policy.service'
import { FileCleanupService } from './services/file-cleanup.service'
import { AvatarAccessService } from './services/avatar-access.service'

@Module({
	imports: [forwardRef(() => SessionsModule)],
	providers: [
		/* Реализация хранилища подставляется здесь: остальной код о S3 не знает. */
		{ provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
		FileRegistryService,
		UploadPolicyService,
		FileCleanupService,
		StorageService,
		AvatarAccessService
	],
	exports: [StorageService, AvatarAccessService]
})
export class StorageModule {}

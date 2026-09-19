import { Global, Module } from '@nestjs/common'
import { PrivacyAccessService } from './privacy-access.service'

@Global()
@Module({
	providers: [PrivacyAccessService],
	exports: [PrivacyAccessService]
})
export class PrivacyModule {}

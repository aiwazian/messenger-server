import { Module, forwardRef } from '@nestjs/common'
import { SessionsService } from './sessions.service'
import { SessionsController } from './sessions.controller'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
	imports: [forwardRef(() => RealtimeModule)],
	controllers: [SessionsController],
	providers: [SessionsService],
	exports: [SessionsService]
})
export class SessionsModule {}

import { Global, Module, forwardRef } from '@nestjs/common'
import { RealtimeGateway } from './realtime.gateway'
import { SessionsModule } from '../sessions/sessions.module'

@Global()
@Module({
	imports: [forwardRef(() => SessionsModule)],
	providers: [RealtimeGateway],
	exports: [RealtimeGateway]
})
export class RealtimeModule { }

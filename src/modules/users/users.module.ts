import { Module, forwardRef } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { StorageModule } from '../storage/storage.module'
import { JwtAuthModule } from '../security/jwt.module'

@Module({
	imports: [JwtAuthModule, SessionsModule, SearchModule, forwardRef(() => StorageModule)],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService]
})
export class UsersModule { }

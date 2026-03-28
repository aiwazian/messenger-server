import { Module, forwardRef } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { JwtAuthModule } from 'src/modules/security/jwt.module'
import { SessionsModule } from '../sessions/sessions.module'
import { SearchModule } from '../search/search.module'
import { StorageModule } from '../storage/storage.module'

@Module({
    imports: [JwtAuthModule, SessionsModule, SearchModule, forwardRef(() => StorageModule)],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService]
})
export class UsersModule { }

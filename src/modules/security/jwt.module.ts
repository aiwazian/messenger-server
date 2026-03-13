import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { JwtAuthService } from './jwt.service'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Module({
    imports: [
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET_KEY'),
                signOptions: { expiresIn: '1y' }
            })
        })
    ],
    providers: [JwtAuthService],
    exports: [JwtAuthService]
})
export class JwtAuthModule { }

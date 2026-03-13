import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService as NestJwtService } from '@nestjs/jwt'
import { TokenPayload } from 'src/common/types/token-payload.type'
import { UserId } from 'src/common/types/user-id.type'

// Token expiry constants - security best practice
const ACCESS_TOKEN_EXPIRY = '30d'
const REFRESH_TOKEN_EXPIRY = '90d'

@Injectable()
export class JwtAuthService {
    constructor(private readonly jwtService: NestJwtService) { }

    generateToken(userId: UserId, tokenType: 'access' | 'refresh' = 'access'): string {
        const expiresIn = tokenType === 'access' ? ACCESS_TOKEN_EXPIRY : REFRESH_TOKEN_EXPIRY
        return this.jwtService.sign({ sub: userId.toString(), type: tokenType }, { expiresIn })
    }

    generateTokenPair(userId: UserId): { accessToken: string; refreshToken: string } {
        return {
            accessToken: this.generateToken(userId, 'access'),
            refreshToken: this.generateToken(userId, 'refresh')
        }
    }

    verifyToken(token: string): TokenPayload {
        try {
            const payload = this.jwtService.verify(token)

            // Reject refresh tokens as access tokens
            if (payload.type === 'refresh') {
                throw new UnauthorizedException('Invalid token type')
            }

            return { userId: UserId(payload.sub) }
        } catch (err) {
            throw new UnauthorizedException('Invalid or expired token')
        }
    }

    verifyRefreshToken(token: string): TokenPayload {
        try {
            const payload = this.jwtService.verify(token)

            // Only accept refresh tokens
            if (payload.type !== 'refresh') {
                throw new UnauthorizedException('Invalid token type')
            }

            return { userId: UserId(payload.sub) }
        } catch (err) {
            throw new UnauthorizedException('Invalid or expired refresh token')
        }
    }
}

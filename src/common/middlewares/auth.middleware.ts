import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common'
import { Response, NextFunction } from 'express'

interface AuthRequest extends Request {
	token?: string
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
	use(req: AuthRequest, res: Response, next: NextFunction) {
		const authHeader = req.headers['authorization'] || req.headers['Authorization']

		if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
			throw new UnauthorizedException('Authorization header is missing or invalid')
		}

		const token = authHeader.slice(7).trim()

		if (!token) {
			throw new UnauthorizedException('Token is required')
		}

		req.token = token

		next()
	}
}

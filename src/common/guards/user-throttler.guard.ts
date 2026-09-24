import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { createHash } from 'node:crypto'

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
	protected async getTracker(req: Record<string, any>): Promise<string> {
		const authHeader = req.headers?.['authorization'] || req.headers?.['Authorization']

		if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
			const token = authHeader.slice(7).trim()
			if (token) return createHash('sha256').update(token).digest('hex')
		}

		return super.getTracker(req)
	}
}

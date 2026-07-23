import { Injectable } from '@nestjs/common'

interface PendingEmail {
	email: string
	code: string
	expiresAt: number
}

@Injectable()
export class EmailVerificationStore {
	private store = new Map<bigint, PendingEmail>()

	generateCode(userId: bigint, email: string): string {
		const code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('')

		this.store.set(userId, {
			email,
			code,
			expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
		})

		return code
	}

	validate(userId: bigint, code: string): { valid: boolean; email?: string } {
		const pending = this.store.get(userId)
		if (!pending) return { valid: false }

		if (Date.now() > pending.expiresAt) {
			this.store.delete(userId)
			return { valid: false }
		}

		const valid = pending.code === code
		const email = valid ? pending.email : undefined

		return { valid, email }
	}

	consume(userId: bigint, code: string): { valid: boolean; email?: string } {
		const result = this.validate(userId, code)
		if (result.valid) {
			this.store.delete(userId)
		}
		return result
	}

	verify(userId: bigint, code: string): { valid: boolean; email?: string } {
		return this.consume(userId, code)
	}

	delete(userId: bigint): void {
		this.store.delete(userId)
	}
}

import { Brand } from './brand'

export type UserId = Brand<bigint, 'UserId'>

export function UserId(value: string | bigint | number) {
	if (!/^\d+$/.test(value.toString())) {
		throw new Error('Invalid user id')
	}

	return BigInt(value) as UserId
}

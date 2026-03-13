import { Brand } from './brand'

export type GroupId = Brand<bigint, 'GroupId'>

export function GroupId(value: string | bigint | number) {
	if (!/^\d+$/.test(value.toString())) {
		throw new Error('Invalid group id')
	}

	return BigInt(value) as GroupId
}

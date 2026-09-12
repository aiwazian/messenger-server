import { Brand } from './brand'

export type EmojiPackId = Brand<bigint, 'EmojiPackId'>

export function EmojiPackId(value: string | bigint | number) {
	if (!/^\d+$/.test(value.toString())) {
		throw new Error('Invalid emoji pack id')
	}

	return BigInt(value) as EmojiPackId
}

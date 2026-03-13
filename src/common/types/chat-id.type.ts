import { Brand } from './brand'

export type ChatId = Brand<bigint, 'ChatId'>

export function ChatId(value: string | bigint | number) {
	if (!/^\d+$/.test(value.toString())) {
		throw new Error('Invalid chat id')
	}

	return BigInt(value) as ChatId
}

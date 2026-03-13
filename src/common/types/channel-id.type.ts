import { Brand } from './brand'

export type ChannelId = Brand<bigint, 'ChannelId'>

export function ChannelId(value: string | bigint | number) {
	if (!/^\d+$/.test(value.toString())) {
		throw new Error('Invalid channel id')
	}

	return BigInt(value) as ChannelId
}

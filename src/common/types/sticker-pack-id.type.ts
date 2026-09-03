import { Brand } from './brand'

export type StickerPackId = Brand<bigint, 'StickerPackId'>

export function StickerPackId(value: string | bigint | number) {
	if (!/^\d+$/.test(value.toString())) {
		throw new Error('Invalid sticker pack id')
	}

	return BigInt(value) as StickerPackId
}

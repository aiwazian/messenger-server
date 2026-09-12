const CUSTOM_EMOJI_TOKEN_PATTERN = /\[ce:(\d+):(\d+)]/g

const MAX_CUSTOM_EMOJI_ID = 9223372036854775807n

export const DEFAULT_CUSTOM_EMOJI = '👍'

export function extractCustomEmojiIds(text: string): bigint[] {
	const ids = new Set<bigint>()

	for (const match of text.matchAll(CUSTOM_EMOJI_TOKEN_PATTERN)) {
		const id = BigInt(match[2])

		if (id > 0n && id <= MAX_CUSTOM_EMOJI_ID) {
			ids.add(id)
		}
	}

	return Array.from(ids)
}

export function replaceCustomEmojiTokens(text: string, symbols: Map<string, string>): string {
	return text.replace(
		CUSTOM_EMOJI_TOKEN_PATTERN,
		(_match, _packId: string, emojiId: string) => symbols.get(emojiId) ?? DEFAULT_CUSTOM_EMOJI
	)
}

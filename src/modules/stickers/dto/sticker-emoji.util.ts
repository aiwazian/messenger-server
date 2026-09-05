const SKIN_TONE_PATTERN = new RegExp('[\\u{1F3FB}-\\u{1F3FF}]', 'gu')

const EMOJI_UNIT =
	'(?:[\\u{1F1E6}-\\u{1F1FF}]{2}' +
	'|\\u{1F3F4}[\\u{E0020}-\\u{E007E}]+\\u{E007F}' +
	'|[0-9#*]\\uFE0F?\\u20E3' +
	'|\\p{Extended_Pictographic}\\uFE0F?)'

export const STICKER_EMOJI_PATTERN = new RegExp(
	`^${EMOJI_UNIT}(?:\\u200D${EMOJI_UNIT})*$`,
	'u'
)

export function normalizeStickerEmoji(value: string): string {
	return value.replace(SKIN_TONE_PATTERN, '')
}

export function normalizeStickerEmojis(value: unknown): unknown {
	if (!Array.isArray(value)) {
		return value
	}

	return value.map(item =>
		typeof item === 'string' ? normalizeStickerEmoji(item) : item
	)
}

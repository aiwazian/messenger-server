export interface ListRange {
	skip: number
	take: number
}

const DEFAULT_TAKE = 100
const MAX_SKIP = 10_000

export function clampListRange(skip: number, take: number, maxTake: number = 500): ListRange {
	const safeSkip = Number.isSafeInteger(skip) && skip > 0 ? Math.min(skip, MAX_SKIP) : 0
	const safeTake = Number.isSafeInteger(take) && take > 0 ? Math.min(take, maxTake) : DEFAULT_TAKE

	return { skip: safeSkip, take: safeTake }
}

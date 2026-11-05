import { BadRequestException } from '@nestjs/common'

export function resolveScheduledTime(rawScheduledAt?: string | null): bigint | null {
	if (!rawScheduledAt) return null

	const scheduledAt = BigInt(rawScheduledAt)

	if (scheduledAt <= BigInt(Date.now())) {
		throw new BadRequestException('Scheduled time must be in the future')
	}

	return scheduledAt
}

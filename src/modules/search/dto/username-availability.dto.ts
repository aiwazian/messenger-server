export type UsernameAvailabilityReason = 'taken' | 'blocked'

export interface UsernameAvailabilityDto {
	available: boolean
	reason: UsernameAvailabilityReason | null
}

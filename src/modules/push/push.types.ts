export type PushPayload = {
	title: string
	body: string
	data?: Record<string, string>
}

export interface PushProvider {
	sendToTokens(tokens: string[], payload: PushPayload): Promise<void>
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER')

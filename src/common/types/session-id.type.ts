import { Brand } from "./brand"

export type SessionId = Brand<number, 'UserId'>

export function SessionId(value: number) {
    if (!/^\d+$/.test(value.toString())) {
        throw new Error('Invalid session id')
    }

    return Number(value) as SessionId
}
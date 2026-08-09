import { createHash, randomBytes } from 'node:crypto'

/**
 * Префикс токена сессии.
 *
 * По нему токен опознаётся как секрет именно этого сервиса: в логах, в
 * репозитории, в чужом коде. Так делают GitHub (ghp_) и Matrix (syt_).
 */
const TOKEN_PREFIX = 'msg_'

/** 32 байта из CSPRNG: перебор невозможен, а токен живёт без срока. */
const TOKEN_BYTES = 32

/** base64url от 32 байт — ровно 43 символа без выравнивания '='. */
const TOKEN_BODY_LENGTH = 43

const TOKEN_FORMAT = new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{${TOKEN_BODY_LENGTH}}$`)

/**
 * Новый токен сессии: случайная строка без внутренней структуры.
 *
 * В токене нет ни идентификатора пользователя, ни срока действия — всё это
 * лежит в таблице сессий, поэтому сервер не обязан верить самому токену.
 */
export function generateSessionToken(): string {
	return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * Хэш для хранения и поиска сессии.
 *
 * Соль и bcrypt здесь не нужны, в отличие от пароля: токен уже содержит 256
 * бит энтропии, перебирать его по радужным таблицам нечем. Зато SHA-256
 * детерминирован, поэтому сессия ищется одним запросом по индексу.
 */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}

/**
 * Проверка формата до обращения к базе: мусор и токены прежнего формата
 * отбрасываются без запроса.
 */
export function isSessionTokenFormat(value: unknown): value is string {
	return typeof value === 'string' && TOKEN_FORMAT.test(value)
}

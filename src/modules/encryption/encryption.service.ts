import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

/** Base64 без переносов: из этих символов состоят все три части шифртекста. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

@Injectable()
export class EncryptionService {
	constructor(private readonly config: ConfigService) {}

	private getKey(version: number): Buffer {
		const hex = this.config.get<string>(`ENCRYPTION_KEY_V${version}`)
		if (!hex) throw new Error(`Encryption key v${version} not found`)
		return Buffer.from(hex, 'hex')
	}

	get currentVersion(): number {
		return Number(this.config.get('CURRENT_ENCRYPTION_VERSION'))
	}

	encrypt(plaintext: string): { encrypted: string; version: number } {
		const version = this.currentVersion
		const key = this.getKey(version)

		const iv = crypto.randomBytes(IV_LENGTH)
		const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
			authTagLength: TAG_LENGTH
		})

		const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
		const authTag = cipher.getAuthTag()

		const result = [
			iv.toString('base64'),
			authTag.toString('base64'),
			encrypted.toString('base64')
		].join(':')

		return { encrypted: result, version }
	}

	/**
	 * Расшифровка текста сообщения.
	 *
	 * Значение, не похожее на шифртекст, возвращается как есть. Так в базе лежат
	 * подписи к вложениям: до этой правки confirmFileUpload сохранял их открытым
	 * текстом, а читались они как шифртекст — split(':') давал одну часть, и
	 * Buffer.from(undefined) ронял весь список чатов пятисоткой из-за одного
	 * сообщения. Проверка формата дешевле try/catch у каждого вызывающего и
	 * заодно не теряет содержимое уже сохранённых подписей.
	 */
	decrypt(encryptedData: string, version: number): string {
		if (!this.looksEncrypted(encryptedData)) return encryptedData

		const key = this.getKey(version)
		const [ivB64, tagB64, dataB64] = encryptedData.split(':')

		const iv = Buffer.from(ivB64, 'base64')
		const authTag = Buffer.from(tagB64, 'base64')
		const data = Buffer.from(dataB64, 'base64')

		const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
			authTagLength: TAG_LENGTH
		})
		decipher.setAuthTag(authTag)

		return decipher.update(data, undefined, 'utf8') + decipher.final('utf8')
	}

	/**
	 * Похоже ли значение на шифртекст: три base64-части, IV в 12 байт и тег в 16.
	 *
	 * Одного счёта двоеточий мало: обычная подпись вида «12:30:45 сбор» тоже
	 * распадается на три части, но шифртекстом не является.
	 */
	private looksEncrypted(value: string): boolean {
		if (!value) return false

		const parts = value.split(':')

		if (parts.length !== 3) return false
		if (!parts.every((part) => BASE64_PATTERN.test(part))) return false

		const [ivB64, tagB64] = parts

		return (
			Buffer.from(ivB64, 'base64').length === IV_LENGTH &&
			Buffer.from(tagB64, 'base64').length === TAG_LENGTH
		)
	}
}

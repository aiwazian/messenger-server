import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

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

	decrypt(encryptedData: string, version: number): string {
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
}

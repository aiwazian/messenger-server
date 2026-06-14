import OpenAI from 'openai'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class ContentModerationService {
	private readonly openai: OpenAI
	private readonly logger = new Logger(ContentModerationService.name)

	constructor(private readonly configService: ConfigService) {
		this.openai = new OpenAI({
			baseURL: this.configService.get('AI_API_URL'),
			apiKey: this.configService.get('AI_API_KEY')
		})
	}

	async isAllowed(text: string): Promise<boolean> {
		try {
			const response = await this.openai.chat.completions.create({
				model: this.configService.get('AI_API_MODEL')!,
				messages: [
					{
						role: 'system',
						content: `You are a content moderation expert for a real-time messenger application. 
                        Your task is to analyze the user's message and determine if it violates safety policies.

                        PROHIBITED CATEGORIES:
                        1. Pornography and sexually explicit content(including slang).
                        2. Illegal drugs(promotion, sale, or instructions).
                        3. Hate speech or extreme harassment.
                        4. Promotion of violence or self- harm.

                        INSTRUCTIONS:
                        - Analyze the text regardless of the language.
                        - Respond ONLY in JSON format.
                        - STRICT RULE: If the message contains ANY mention, slang, or terminology related to the PROHIBITED CATEGORIES (even as a single word without context), set "is_allowed" to false.
                        - Treat words like "sex", "porn", "drugs" as immediate violations regardless of intent.
                        - If the content is safe, set "is_allowed" to true.
                        - If the content violates policies, set "is_allowed" to false and provide a brief "reason" in English.`
					},
					{
						role: 'user',
						content: text
					}
				],
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'ModerationResult',
						strict: true,
						schema: {
							type: 'object',
							properties: {
								is_allowed: {
									type: 'boolean',
									description: 'Whether the message is allowed'
								}
							},
							required: ['is_allowed'],
							additionalProperties: false
						}
					},
				},
				stream: false
			})

			const content = response.choices[0].message.content
			if (!content) return false

			try {
				const data = JSON.parse(content)
				return data.is_allowed === true
			} catch (e) {
				this.logger.error(`Invalid JSON from AI: ${content}`)
				return false
			}
		} catch (error) {
			this.logger.error('Content moderation failed', error)
			return false
		}
	}
}

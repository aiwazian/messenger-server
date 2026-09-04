import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GetBucketPolicyCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3'

/*
 * Применение политики доступа к бакету.
 *
 * Панель провайдера переключает публичность только у бакета целиком, а открыть
 * нужно один префикс stickers/. Такая настройка есть только в S3 API, поэтому
 * политика ставится отсюда.
 *
 * Запуск разовый, вручную: после создания бакета и после каждой правки
 * policy.json. На старте сервера не вызывается: права на смену политики не нужны
 * приложению в работе.
 *
 *   npm run s3:policy                 — берёт scripts/policy.json
 *   npm run s3:policy -- my.json      — берёт указанный файл
 */

const DEFAULT_POLICY_PATH = 'scripts/policy.json'

/*
 * Имя бакета не хранится в policy.json: файл лежит в репозитории, а бакет у каждого
 * окружения свой. В ресурсах пишется __BUCKET__, подстановка идёт из S3_BUCKET_NAME.
 */
const BUCKET_PLACEHOLDER = /__BUCKET__/g

function requireEnv(name: string): string {
	const value = process.env[name]

	if (!value) {
		throw new Error(`${name} is not set`)
	}

	return value
}

async function main(): Promise<void> {
	const bucket = requireEnv('S3_BUCKET_NAME')
	const policyPath = resolve(process.cwd(), process.argv[2] ?? DEFAULT_POLICY_PATH)
	const source = readFileSync(policyPath, 'utf8').replace(BUCKET_PLACEHOLDER, bucket)

	/*
	 * Разбор JSON до отправки: на сломанный файл провайдер отвечает MalformedPolicy без
	 * указания места, а тут сразу видна позиция ошибки.
	 */
	const policy = JSON.stringify(JSON.parse(source))

	const client = new S3Client({
		region: requireEnv('S3_REGION'),
		endpoint: requireEnv('S3_END_POINT'),
		credentials: {
			accessKeyId: requireEnv('S3_ACCESS_KEY'),
			secretAccessKey: requireEnv('S3_SECRET_KEY')
		},
		forcePathStyle: true
	})

	try {
		await client.send(
			new PutBucketPolicyCommand({
				Bucket: bucket,
				Policy: policy
			})
		)

		/*
		 * Чтение политики обратно: подтверждает, что применилась именно она, а не
		 * осталась прежняя.
		 */
		const applied = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }))

		console.log(`Policy from ${policyPath} applied to bucket ${bucket}`)
		console.log(applied.Policy)
	} finally {
		client.destroy()
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})

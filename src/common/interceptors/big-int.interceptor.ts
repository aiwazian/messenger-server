import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { map } from 'rxjs'

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
	intercept(_: ExecutionContext, next: CallHandler) {
		return next.handle().pipe(
			map((data) => {
				return this.serialize(data)
			})
		)
	}

	private serialize(obj: any): any {
		if (obj === null || obj === undefined) return obj
		if (typeof obj === 'bigint') return obj.toString()
		if (Array.isArray(obj)) return obj.map((item) => this.serialize(item))
		if (typeof obj === 'object') {
			// Check if it's a plain object or instance (avoid serializing complex objects like Date, if any)
			if (obj instanceof Date) return obj.getTime()

			const newObj = {}
			for (const key in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					newObj[key] = this.serialize(obj[key])
				}
			}
			return newObj
		}
		return obj
	}
}

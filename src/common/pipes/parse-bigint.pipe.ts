import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common'

@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
	transform(value: string): bigint {
		try {
			return BigInt(value)
		} catch (error) {
			throw new BadRequestException('Validation failed (bigint string is expected)')
		}
	}
}

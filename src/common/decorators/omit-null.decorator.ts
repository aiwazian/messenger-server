import { Transform } from 'class-transformer'

export const OmitNull = () => {
	return Transform(
		({ value }) => {
			if (value === null || value === undefined) {
				return undefined
			}

			if (Array.isArray(value) && value.length === 0) {
				return undefined
			}

			return value
		},
		{ toPlainOnly: true }
	)
}

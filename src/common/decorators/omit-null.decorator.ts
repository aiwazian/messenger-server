import { Transform } from 'class-transformer'

export const OmitNull = () => {
	return Transform(({ value }) => value ?? undefined, { toPlainOnly: true })
}

import { Transform, TransformFnParams } from "class-transformer"

export function Trim() {
    return Transform(({ value }: TransformFnParams) => {
        if (typeof value === 'string') {
            return value.trim()
        }
        return value
    })
}
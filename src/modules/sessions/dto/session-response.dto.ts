import { Exclude, Expose } from "class-transformer"

@Exclude()
export class SessionResponseDto {
    @Expose()
    id: number

    @Expose()
    userId: number

    @Expose()
    createdAt: string

    @Expose()
    deviceModel: string

    @Expose()
    osVersion: string

    @Expose()
    osName: string
}

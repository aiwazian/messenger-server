import { IsOptional, IsString } from "class-validator"
import { Trim } from "src/common/decorators/trim.decorator"

export class SearchQueryDto {
    @IsOptional()
    @IsString()
    @Trim()
    q?: string
}
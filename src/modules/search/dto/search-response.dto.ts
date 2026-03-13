import { Exclude, Expose } from "class-transformer"
import { ChatId } from "src/common/types/chat-id.type"

@Exclude()
export class SearchResponseDto {
    @Expose()
    chatId: ChatId

    @Expose()
    name: string
}
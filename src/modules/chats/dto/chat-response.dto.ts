import { Exclude, Expose } from "class-transformer"
import { OmitNull } from "src/common/decorators/omit-null.decorator"
import { MessageResponseDto } from "src/modules/messages/dto/message-response.dto"

@Exclude()
export class ChatResponseDto {
    @Expose()
    id: number

    @Expose()
    name: string

    @Expose()
    isPinned: string

    @Expose()
    @OmitNull()
    lastMessage?: MessageResponseDto
}
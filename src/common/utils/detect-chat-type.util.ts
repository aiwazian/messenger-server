import { ChatType } from "../enums/chat-type.enum"
import { ChannelId } from "../types/channel-id.type"
import { ChatId } from "../types/chat-id.type"
import { GroupId } from "../types/group-id.type"
import { UserId } from "../types/user-id.type"

export function detectChatType(id: UserId | ChannelId | GroupId | ChatId): ChatType {
    const idString = id.toString()
    const firstDigit = Number(idString[0])

    switch (firstDigit) {
        case 1:
            return ChatType.PRIVATE
        case 2:
            return ChatType.CHANNEL
        case 3:
            return ChatType.GROUP
        default:
            return ChatType.UNKNOWN
    }
}
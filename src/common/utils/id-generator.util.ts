import { randomInt } from 'crypto'
import { ChatType } from '../enums/chat-type.enum'
import { ChannelId } from '../types/channel-id.type'
import { GroupId } from '../types/group-id.type'
import { UserId } from '../types/user-id.type'

const prefixes = {
	user: 1,
	channel: 2,
	group: 3,
	invite: 4
}

export function generateUserId(): UserId {
	return generateUniqueId<UserId>(prefixes.user)
}

export function generateChannelId(): ChannelId {
	return generateUniqueId<ChannelId>(prefixes.channel)
}

export function generateGroupId(): GroupId {
	return generateUniqueId<GroupId>(prefixes.group)
}

export function generateInviteLinkId(): bigint {
	return generateUniqueId<bigint>(prefixes.invite)
}

function generateUniqueId<T>(prefix: number): T {
	const timestamp = Date.now().toString()

	const randomNumber = randomInt(10000, 99999).toString()

	return BigInt(`${prefix}${timestamp}${randomNumber}`) as T
}

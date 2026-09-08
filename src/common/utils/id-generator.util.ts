import { randomInt } from 'crypto'
import { ChannelId } from '../types/channel-id.type'
import { GroupId } from '../types/group-id.type'
import { StickerPackId } from '../types/sticker-pack-id.type'
import { UserId } from '../types/user-id.type'

const prefixes = {
	user: 1,
	channel: 2,
	group: 3,
	stickerPack: 4
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

export function generateStickerPackId(): StickerPackId {
	return generateUniqueId<StickerPackId>(prefixes.stickerPack)
}

function generateUniqueId<T>(prefix: number): T {
	const timestamp = Date.now().toString()

	const randomNumber = randomInt(10000, 99999).toString()

	return BigInt(`${prefix}${timestamp}${randomNumber}`) as T
}

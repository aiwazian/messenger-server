export const SocketEvent = {
	MESSAGE_NEW: 'message:new',
	MESSAGE_EDIT: 'message:edit',
	MESSAGE_UPDATE: 'message:update',
	MESSAGE_DELETE: 'message:delete',

	CHAT_TYPING: 'chat:typing',
	CHAT_OPEN: 'chat:open',
	CHAT_CLOSE: 'chat:close',
	CHAT_READ: 'chat:read',
	CHAT_NEW: 'chat:new',
	HISTORY_CLEAR: 'chat:history_clear',

	USER_ONLINE: 'user:online',
	USER_OFFLINE: 'user:offline',
	AUTH_ERROR: 'auth:error',
	UNAUTHORIZED: 'Unauthorized'
} as const

export type SocketEventType = (typeof SocketEvent)[keyof typeof SocketEvent]

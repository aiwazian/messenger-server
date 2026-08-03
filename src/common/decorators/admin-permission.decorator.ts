import { SetMetadata } from '@nestjs/common'

/**
 * Право администратора канала или группы.
 *
 * Названия совпадают с полями ChannelAdminPermission и GroupAdminPermission,
 * поэтому гварды читают нужный флаг напрямую по ключу.
 */
export type AdminPermission = 'canManageInviteLinks' | 'canEditProfile'

export const ADMIN_PERMISSION_KEY = 'adminPermission'

/**
 * Требует у текущего пользователя конкретное право администратора.
 *
 * Владелец канала или группы проходит проверку всегда: строки прав у него нет.
 */
export const RequireAdminPermission = (permission: AdminPermission) =>
	SetMetadata(ADMIN_PERMISSION_KEY, permission)

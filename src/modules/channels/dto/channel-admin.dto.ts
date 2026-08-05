import { IsBoolean, IsOptional } from 'class-validator'

/**
 * Выдача или изменение прав администратора канала.
 *
 * Пропущенные поля трактуются как «право не выдано».
 */
export class UpsertChannelAdminDto {
	/** Пригласительные ссылки: создание и удаление ссылок канала. */
	@IsOptional()
	@IsBoolean()
	canManageInviteLinks?: boolean

	/** Изменение профиля канала: название, описание и фотографии. */
	@IsOptional()
	@IsBoolean()
	canEditProfile?: boolean

	/**
	 * Управление администраторами: назначение, снятие и изменение их прав.
	 *
	 * Выдать это право может только владелец канала.
	 */
	@IsOptional()
	@IsBoolean()
	canManageAdmins?: boolean
}

/** Администратор канала и его права. */
export class ChannelAdminResponseDto {
	userId: string
	firstName?: string
	lastName?: string
	username?: string
	canManageInviteLinks: boolean
	canEditProfile: boolean
	canManageAdmins: boolean
	grantedAt: string
}

/** Права текущего пользователя в канале. */
export class MyChannelPermissionsDto {
	isOwner: boolean
	isAdmin: boolean
	canManageInviteLinks: boolean
	canEditProfile: boolean
	canManageAdmins: boolean
}

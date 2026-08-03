import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * Выдача или изменение прав администратора группы.
 *
 * Пропущенные поля трактуются как «право не выдано», tag можно очистить,
 * передав null или пустую строку.
 */
export class UpsertGroupAdminDto {
	/** Пригласительные ссылки: создание и удаление ссылок группы. */
	@IsOptional()
	@IsBoolean()
	canManageInviteLinks?: boolean

	/** Изменение профиля группы: название, описание и фотографии. */
	@IsOptional()
	@IsBoolean()
	canEditProfile?: boolean

	/** Тег участника: подпись рядом с именем отправителя в сообщениях группы. */
	@IsOptional()
	@IsString()
	@MaxLength(32)
	tag?: string | null
}

/** Администратор группы, его права и тег. */
export class GroupAdminResponseDto {
	userId: string
	firstName?: string
	lastName?: string
	username?: string
	canManageInviteLinks: boolean
	canEditProfile: boolean
	tag?: string
	grantedAt: string
}

/** Права текущего пользователя в группе. */
export class MyGroupPermissionsDto {
	isOwner: boolean
	isAdmin: boolean
	canManageInviteLinks: boolean
	canEditProfile: boolean
	tag?: string
}

/** Тег участника группы: показывается рядом с именем отправителя. */
export class GroupMemberTagDto {
	userId: string
	tag: string
}

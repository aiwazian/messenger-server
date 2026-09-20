import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../providers/prisma/prisma.service'
import { UserId } from '../types/user-id.type'
import { PrivacyExceptionKind, PrivacyField, PrivacyRule } from '../../generated/prisma/enums'

export type PrivacyExceptionLists = {
	alwaysShow: Set<string>
	alwaysHide: Set<string>
}

export const EMPTY_PRIVACY_EXCEPTIONS: PrivacyExceptionLists = {
	alwaysShow: new Set(),
	alwaysHide: new Set()
}

@Injectable()
export class PrivacyAccessService {
	constructor(private readonly prisma: PrismaService) {}

	async getExceptionsForOwner(
		ownerId: UserId,
		fields: PrivacyField[]
	): Promise<Map<PrivacyField, PrivacyExceptionLists>> {
		const rows = await this.prisma.privacyException.findMany({
			where: { ownerId, field: { in: fields } },
			select: { field: true, kind: true, targetId: true }
		})

		return groupExceptionRows(rows).get('') ?? new Map()
	}

	async getExceptionsForOwners(
		ownerIds: bigint[],
		fields: PrivacyField[]
	): Promise<Map<string, Map<PrivacyField, PrivacyExceptionLists>>> {
		if (ownerIds.length === 0) return new Map()

		const rows = await this.prisma.privacyException.findMany({
			where: { ownerId: { in: ownerIds }, field: { in: fields } },
			select: { ownerId: true, field: true, kind: true, targetId: true }
		})

		const result = new Map<string, Map<PrivacyField, PrivacyExceptionLists>>()
		for (const [ownerId, lists] of groupExceptionRows(rows, (row) => row.ownerId.toString())) {
			result.set(ownerId, lists)
		}

		return result
	}

	isAllowed(
		rule: PrivacyRule | undefined,
		exceptions: PrivacyExceptionLists | undefined,
		viewerId?: UserId
	): boolean {
		if (!viewerId) return rule !== PrivacyRule.NOBODY
		if (!exceptions) return rule !== PrivacyRule.NOBODY

		const key = viewerId.toString()
		if (exceptions.alwaysHide.has(key)) return false
		if (rule === PrivacyRule.NOBODY) return exceptions.alwaysShow.has(key)

		return true
	}
}

type ExceptionRow = {
	ownerId?: bigint
	field: PrivacyField
	kind: PrivacyExceptionKind
	targetId: bigint
}

function groupExceptionRows<T extends ExceptionRow>(
	rows: T[],
	keyOf: (row: T) => string = () => ''
): Map<string, Map<PrivacyField, PrivacyExceptionLists>> {
	const grouped = new Map<string, Map<PrivacyField, PrivacyExceptionLists>>()

	for (const row of rows) {
		const key = keyOf(row)
		let byField = grouped.get(key)
		if (!byField) {
			byField = new Map()
			grouped.set(key, byField)
		}

		let lists = byField.get(row.field)
		if (!lists) {
			lists = { alwaysShow: new Set(), alwaysHide: new Set() }
			byField.set(row.field, lists)
		}

		const targetKey = row.targetId.toString()
		if (row.kind === PrivacyExceptionKind.ALWAYS_SHOW) {
			lists.alwaysShow.add(targetKey)
		} else {
			lists.alwaysHide.add(targetKey)
		}
	}

	return grouped
}

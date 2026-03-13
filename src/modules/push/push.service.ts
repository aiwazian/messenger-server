import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from 'src/providers/prisma/prisma.service'
import { UserId } from 'src/common/types/user-id.type'
import { PUSH_PROVIDER, PushPayload, PushProvider } from './push.types'

@Injectable()
export class PushService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(PUSH_PROVIDER) private readonly provider: PushProvider
    ) { }

    async sendToUsers(userIds: UserId[], payload: PushPayload): Promise<void> {
        if (userIds.length === 0) return

        const tokens = await this.prisma.session.findMany({
            where: {
                userId: { in: userIds },
                fcmToken: { not: null }
            },
            select: { fcmToken: true }
        })

        const uniqueTokens = Array.from(
            new Set(tokens.map(t => t.fcmToken).filter((t): t is string => !!t))
        )

        if (uniqueTokens.length === 0) return

        await this.provider.sendToTokens(uniqueTokens, payload)
    }
}

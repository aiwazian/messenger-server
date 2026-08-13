import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'

/*
 * Пауза перед тем, как объявить офлайн. Мобильная сеть рвётся постоянно, и без
 * задержки собеседники видят мигание "онлайн/офлайн", а сервер на каждое такое
 * мигание рассылает веер событий. Реконнект внутри паузы наружу не виден вообще.
 */
const OFFLINE_GRACE_MS = 10_000

/*
 * Подстраховка от сокетов-зомби. Штатно мёртвое соединение закрывает сам
 * engine.io (ping раз в 20 секунд, ожидание pong — 30), поэтому порог здесь
 * заведомо больше суммы этих таймаутов: сюда попадают только те соединения,
 * по которым не пришло вообще ничего, включая pong.
 */
const STALE_CONNECTION_MS = 60_000

const SWEEP_INTERVAL_MS = 15_000

/**
 * Как сервис сообщает наружу о смене статуса.
 *
 * Сам он про socket.io ничего не знает: рассылка и разрыв соединений живут в
 * шлюзе, здесь остаётся только состояние и решение о том, когда о нём говорить.
 */
export type PresenceHandlers = {
	announceOnline: (userId: string) => void
	announceOffline: (userId: string) => void
	dropSocket: (socketId: string, reason: string) => void
}

@Injectable()
export class PresenceService implements OnModuleDestroy {
	private readonly logger = new Logger(PresenceService.name)

	/*
	 * userId -> socketId -> время последнего пакета от клиента.
	 *
	 * Пользователь считается онлайн, пока у него есть хотя бы одно живое
	 * соединение, поэтому вход со второго устройства не порождает повторных
	 * оповещений, а выход из одного из двух — преждевременного офлайна.
	 */
	private readonly connections = new Map<string, Map<string, number>>()

	/* Пользователи, о чьём онлайне собеседникам уже сказали. */
	private readonly announced = new Set<string>()

	/* Отложенные оповещения об офлайне: userId -> таймер. */
	private readonly pendingOffline = new Map<string, NodeJS.Timeout>()

	private handlers: PresenceHandlers | null = null
	private sweepTimer: NodeJS.Timeout | null = null

	setHandlers(handlers: PresenceHandlers): void {
		this.handlers = handlers

		if (this.sweepTimer) return

		this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
		this.sweepTimer.unref()
	}

	/**
	 * Регистрирует новое соединение пользователя.
	 *
	 * Оповещение об онлайне уходит только на первое соединение: второе
	 * устройство и реконнект внутри паузы для собеседников ничего не меняют.
	 */
	register(userId: string, socketId: string): void {
		const sockets = this.connections.get(userId) ?? new Map<string, number>()
		sockets.set(socketId, Date.now())
		this.connections.set(userId, sockets)

		const pending = this.pendingOffline.get(userId)
		if (pending) {
			clearTimeout(pending)
			this.pendingOffline.delete(userId)
		}

		if (this.announced.has(userId)) return

		this.announced.add(userId)
		this.handlers?.announceOnline(userId)
	}

	/* Продлевает жизнь соединения: вызывается на каждый пакет от клиента. */
	touch(userId: string, socketId: string): void {
		const sockets = this.connections.get(userId)
		if (!sockets?.has(socketId)) return

		sockets.set(socketId, Date.now())
	}

	unregister(userId: string, socketId: string): void {
		const sockets = this.connections.get(userId)
		if (!sockets) return

		sockets.delete(socketId)
		if (sockets.size > 0) return

		this.connections.delete(userId)
		this.scheduleOffline(userId)
	}

	/*
	 * Статус считается по живым сокетам, а не по тому, что уже объявлено
	 * собеседникам: внутри паузы перед офлайном доставлять сообщение по
	 * вебсокету уже некуда, и отправитель должен уйти в пуш.
	 */
	isOnline(userId: string): boolean {
		return this.connections.has(userId)
	}

	get onlineCount(): number {
		return this.connections.size
	}

	private scheduleOffline(userId: string): void {
		if (!this.announced.has(userId)) return
		if (this.pendingOffline.has(userId)) return

		const timer = setTimeout(() => {
			this.pendingOffline.delete(userId)

			/* За время паузы пользователь мог вернуться — тогда молчим. */
			if (this.connections.has(userId)) return
			if (!this.announced.delete(userId)) return

			this.handlers?.announceOffline(userId)
		}, OFFLINE_GRACE_MS)

		timer.unref()
		this.pendingOffline.set(userId, timer)
	}

	private sweep(): void {
		const now = Date.now()

		for (const [userId, sockets] of this.connections) {
			for (const [socketId, lastActivityAt] of sockets) {
				if (now - lastActivityAt <= STALE_CONNECTION_MS) continue

				sockets.delete(socketId)
				this.logger.warn(`Stale socket ${socketId} of user ${userId}`)
				this.handlers?.dropSocket(socketId, 'no packets received')
			}

			if (sockets.size > 0) continue

			this.connections.delete(userId)
			this.scheduleOffline(userId)
		}
	}

	onModuleDestroy(): void {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer)
			this.sweepTimer = null
		}

		for (const timer of this.pendingOffline.values()) {
			clearTimeout(timer)
		}

		this.pendingOffline.clear()
	}
}

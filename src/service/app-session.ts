/**
 * Управление «тёплой» сессией клиента.
 * Пока играет музыка или пользователь активен — не сбрасываем сессию.
 * Если пауза и нет активности 10 минут — следующий запуск будет «холодным».
 */

export const SESSION_STORAGE_KEY = 'kumaflow_app_session'
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000
export const HEARTBEAT_INTERVAL_MS = 30 * 1000
const PING_CACHE_TTL_MS = 2 * 60 * 1000

interface AppSessionData {
  lastActivityAt: number
  lastHeartbeatAt: number
  wasPlaying: boolean
}

let pingCache: { ok: boolean; at: number } | null = null

function readSession(): AppSessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AppSessionData
  } catch {
    return null
  }
}

function writeSession(data: AppSessionData) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
}

function createSession(isPlaying = false): AppSessionData {
  const now = Date.now()
  return {
    lastActivityAt: now,
    lastHeartbeatAt: now,
    wasPlaying: isPlaying,
  }
}

export function isWarmSession(): boolean {
  const session = readSession()
  if (!session) return false

  const idleMs = Date.now() - session.lastActivityAt

  if (session.wasPlaying && Date.now() - session.lastHeartbeatAt < IDLE_TIMEOUT_MS) {
    return true
  }

  return idleMs < IDLE_TIMEOUT_MS
}

export function ensureSessionStarted(): void {
  if (!readSession()) {
    writeSession(createSession())
  }
}

export function touchUserActivity(): void {
  const session = readSession() ?? createSession()
  session.lastActivityAt = Date.now()
  writeSession(session)
}

export function recordHeartbeat(isPlaying: boolean): void {
  const now = Date.now()
  const session = readSession() ?? createSession(isPlaying)
  session.lastHeartbeatAt = now
  session.wasPlaying = isPlaying
  if (isPlaying) {
    session.lastActivityAt = now
  }
  writeSession(session)
}

export function isSessionExpiredWhileIdle(isPlaying: boolean): boolean {
  if (isPlaying) return false
  const session = readSession()
  if (!session) return false
  return Date.now() - session.lastActivityAt >= IDLE_TIMEOUT_MS
}

export function invalidateAppSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  pingCache = null
}

export async function pingWithSessionCache(
  pingFn: () => Promise<boolean>,
): Promise<boolean> {
  if (pingCache && Date.now() - pingCache.at < PING_CACHE_TTL_MS) {
    return pingCache.ok
  }

  const ok = await pingFn()
  pingCache = { ok, at: Date.now() }

  if (ok) {
    touchUserActivity()
  }

  return ok
}

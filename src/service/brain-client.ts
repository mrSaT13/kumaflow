/**
 * KumaFlow 1.6.2 — Brain client (KumaFlow Brain, FastAPI)
 * Base URL + Bearer token (BRAIN_API_TOKEN / DB-токены со скоупами).
 * Пусто = доверенная LAN. Все вызовы best-effort с backoff.
 */

export interface BrainConfig {
  baseUrl: string
  token: string
}

function getConfig(): BrainConfig {
  try {
    const raw = localStorage.getItem('brain_store')
    if (raw) {
      const parsed = JSON.parse(raw)
      const s = parsed?.state ?? parsed
      return {
        baseUrl: (s.baseUrl ?? '').trim().replace(/\/$/, ''),
        token: (s.token ?? '').trim(),
      }
    }
  } catch { /* ignore */ }
  return { baseUrl: '', token: '' }
}

export function isBrainConfigured(): boolean {
  return getConfig().baseUrl.length > 0
}

function headers(): Record<string, string> {
  const { token } = getConfig()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** fetch с ретраями: 2 повтора, backoff 500/1500мс. 401/403 — без ретрая. */
export async function brainFetch<T>(path: string, init?: RequestInit, retries = 2): Promise<T | null> {
  const { baseUrl } = getConfig()
  if (!baseUrl) return null
  const url = `${baseUrl}${path}`
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...headers(), ...(init?.headers as Record<string, string> ?? {}) },
        signal: AbortSignal.timeout(15000),
      })
      if (res.status === 401 || res.status === 403) {
        console.warn(`[Brain] auth failed ${res.status} for ${path}`)
        return null
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (res.status === 204) return null
      return (await res.json()) as T
    } catch (e) {
      lastErr = e
      if (attempt < retries) await sleep(attempt === 0 ? 500 : 1500)
    }
  }
  console.warn(`[Brain] request failed ${path}:`, lastErr)
  return null
}

export async function brainGet<T>(path: string): Promise<T | null> {
  return brainFetch<T>(path, { method: 'GET' })
}

export async function brainPost<T>(path: string, body: unknown): Promise<T | null> {
  return brainFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
}

/** Сырой запрос с видимым HTTP-статусом (для диагностики publish). */
export async function brainRaw(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: string } | null> {
  const { baseUrl } = getConfig()
  if (!baseUrl) return null
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...headers(), ...((init?.headers as Record<string, string>) ?? {}) },
      signal: AbortSignal.timeout(15000),
    })
    const body = await res.text().catch(() => '')
    return { status: res.status, body: body.slice(0, 300) }
  } catch {
    return null
  }
}

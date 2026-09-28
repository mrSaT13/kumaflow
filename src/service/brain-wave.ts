/**
 * KumaFlow 1.6.4 — Brain wave
 * wave/continue + seeds + publish (throttle 5с) + resume. Источник внутри SmartAutoDJ.
 */

import { brainGet, brainPost, brainRaw } from './brain-client'
import { isBrainActive, useBrainStore } from '@/store/brain.store'
import type { BrainEvent, BrainRating } from './brain-sync'

export interface WaveSettings {
  activity?: string
  characteristic?: string
  mood?: string
  language?: string
}

export interface WaveTrack {
  track_id: string
  title: string
  artist_name: string
  score: number
  reason?: string
  external_id?: string
}

let lastPublishAt = 0
let lastPublishKey = ''

/** Маппинг локальных настроек волны в формат мозга */
export function mapWaveSettings(local: Record<string, unknown>): WaveSettings {
  const s = (k: string) => {
    const v = local[k]
    return typeof v === 'string' && v.trim() ? v.trim() : undefined
  }
  return {
    activity: s('activity') ?? s('myWaveActivity'),
    characteristic: s('characteristic') ?? s('myWaveCharacteristic'),
    mood: s('mood') ?? s('myWaveMood'),
    language: s('language') ?? s('myWaveLanguage'),
  }
}

export async function waveContinue(opts: {
  queue: string[]
  currentTrackId?: string | null
  count?: number
  settings?: WaveSettings
  excludeIds?: string[]
  recentEvents?: BrainEvent[]
  ratingsDelta?: BrainRating[]
}): Promise<{ tracks: WaveTrack[]; seeds?: string[]; profile_version?: number } | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return null
  const res = await brainPost<{
    tracks: WaveTrack[]
    seeds?: string[]
    profile_version?: number
    applied?: unknown
  }>(`/api/wave/continue`, {
    user_id: st.userId,
    queue: opts.queue ?? [],
    current_track_id: opts.currentTrackId ?? null,
    count: opts.count ?? 20,
    settings: opts.settings ?? {},
    exclude_ids: opts.excludeIds ?? [],
    recent_events: (opts.recentEvents ?? []).map((e) => ({
      track_id: e.track_id,
      action: e.action,
      position_sec: e.position_sec,
    })),
    ratings_delta: opts.ratingsDelta ?? [],
    profile_version: st.profileVersion ?? undefined,
  })
  if (!res) return null
  if (typeof res.profile_version === 'number') st.setProfileVersion(res.profile_version)
  return { tracks: res.tracks ?? [], seeds: res.seeds, profile_version: res.profile_version }
}

export async function waveSeeds(characteristic?: string, limit = 5): Promise<string[]> {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return []
  const q = new URLSearchParams({ user_id: st.userId, limit: String(limit) })
  if (characteristic) q.set('characteristic', characteristic)
  const res = await brainGet<{ seeds?: string[] }>(`/api/wave/seeds?${q.toString()}`)
  return res?.seeds ?? []
}

/** Живая очередь: fire-and-forget, throttle 5с, одинаковый ключ не шлём.
 * Шлём только вперёд от текущего (без истории) + интра-дедуп по id,
 * иначе веб-зеркало показывает сыгранное как «дальше» и дубли.
 * 1.6.4: позиция/длительность/пауза/имя устройства; force обходит троттлинг
 * (seek/pause/heartbeat). Мозг лишние поля игнорирует — контракт обратно совместим. */
export interface WavePublishExtra {
  positionSec?: number
  durationSec?: number
  paused?: boolean
  deviceName?: string
  /** Обойти троттлинг: seek/pause/heartbeat должны уходить сразу */
  force?: boolean
}

let cachedDeviceName = ''
let cachedDeviceId = ''

/** Стабильный UUID устройства — ключ слота на мозге.
 * Генерируется один раз, хранится в localStorage. Человекочитаемое имя
 * (getWaveDeviceName) для слота НЕ годится: два десктопа назовутся одинаково
 * и упадут в один слот (last-writer-wins). */
export function getWaveDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId
  try {
    const saved = localStorage.getItem('wave_device_id')
    if (saved && saved.trim()) {
      cachedDeviceId = saved.trim().slice(0, 80)
      return cachedDeviceId
    }
  } catch { /* ignore */ }
  let id = ''
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID()
    }
  } catch { /* ignore */ }
  if (!id) {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16)
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }
  try {
    localStorage.setItem('wave_device_id', id)
  } catch { /* ignore */ }
  cachedDeviceId = id
  return cachedDeviceId
}

export function getWaveDeviceName(): string {
  if (cachedDeviceName) return cachedDeviceName
  try {
    const saved = localStorage.getItem('wave_device_name')
    if (saved && saved.trim()) {
      cachedDeviceName = saved.trim().slice(0, 80)
      return cachedDeviceName
    }
  } catch { /* ignore */ }
  let fallback = 'Desktop'
  try {
    const ua = typeof navigator !== 'undefined' ? (navigator.platform || '') : ''
    if (ua) fallback = `Desktop (${ua})`
  } catch { /* ignore */ }
  cachedDeviceName = fallback
  return cachedDeviceName
}

export function formatResumeTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function wavePublish(
  queue: string[],
  currentTrackId?: string | null,
  extra?: WavePublishExtra,
): void {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return
  let q = (queue ?? []).filter(Boolean)
  if (currentTrackId) {
    const at = q.indexOf(currentTrackId)
    if (at > 0) q = q.slice(at)
  }
  // Интра-дедуп: одна песня — один раз, первое вхождение побеждает.
  const seen = new Set<string>()
  q = q.filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
  q = q.slice(0, 100)
  const positionSec = Math.max(0, Math.floor(extra?.positionSec ?? NaN))
  const durationSec = Math.max(0, Math.floor(extra?.durationSec ?? NaN))
  const hasPos = Number.isFinite(positionSec)
  const hasDur = Number.isFinite(durationSec)
  const paused = extra?.paused ?? false
  const deviceName = (extra?.deviceName ?? getWaveDeviceName()).slice(0, 80)
  const now = Date.now()
  // Позиция бакетом по 10с: heartbeat/таймапдейты не спамят, но движение видно.
  const posBucket = hasPos ? Math.floor(positionSec / 10) : -1
  const key = `${st.userId}|${currentTrackId ?? ''}|${q.length}|${q.slice(0, 3).join(',')}|${paused ? 1 : 0}|${posBucket}|${hasDur ? durationSec : -1}`
  if (!extra?.force && now - lastPublishAt < 5000 && key === lastPublishKey) return
  lastPublishAt = now
  lastPublishKey = key
  const payload: Record<string, unknown> = {
    user_id: st.userId,
    queue: q,
    current_track_id: currentTrackId ?? null,
    paused,
    // Дуплет имени флага: мозг может ждать is_paused, шлём оба.
    is_paused: paused,
    // Слот устройства: ключ — стабильный UUID (device), отображаемое имя —
    // отдельно (device_name). Имя для ключа НЕ годится: два десктопа
    // назовутся одинаково и затрут друг друга.
    device: getWaveDeviceId(),
    device_name: deviceName,
  }
  if (hasPos) payload.position_sec = positionSec
  if (hasDur) payload.duration_sec = durationSec
  void (async () => {
    const res = await brainRaw(`/api/wave/publish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!res) {
      st.setLastPublish(new Date().toISOString(), false, 'network error / no response')
    } else if (res.status >= 200 && res.status < 300) {
      st.setLastPublish(new Date().toISOString(), true, null)
    } else {
      st.setLastPublish(
        new Date().toISOString(),
        false,
        `HTTP ${res.status}: ${res.body || '(empty)'}`,
      )
    }
  })().catch(() => undefined)
}

/** Продолжить с телефона: что играло на другом устройстве.
 * Пробуем /api/wave/resume, фолбек — /api/wave/state (старые сборки мозга).
 * Мозг не трогаем: только читаем то, что он и так отдаёт. */
export interface WaveResume {
  track_id: string
  external_id?: string | null
  position_sec?: number
  duration_sec?: number
  queue?: string[]
  device?: string | null
  device_name?: string | null
  updated_at?: string | null
}

export async function waveResume(): Promise<WaveResume | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return null
  const q = new URLSearchParams({ user_id: st.userId })
  const res =
    (await brainGet<WaveResume>(`/api/wave/resume?${q.toString()}`)) ??
    (await brainGet<WaveResume>(`/api/wave/state?${q.toString()}`))
  if (!res) return null
  const trackId = (res.track_id ?? res.external_id ?? '').trim()
  if (!trackId) return null
  return {
    track_id: trackId,
    external_id: res.external_id ?? null,
    position_sec: Number.isFinite(Number(res.position_sec)) ? Math.floor(Number(res.position_sec)) : 0,
    duration_sec: Number.isFinite(Number(res.duration_sec)) ? Math.floor(Number(res.duration_sec)) : 0,
    queue: Array.isArray(res.queue) ? res.queue.filter(Boolean).slice(0, 100) : [],
    device: (res as { device?: unknown }).device != null ? String((res as { device?: unknown }).device) : null,
    device_name: res.device_name ?? null,
    updated_at: res.updated_at ?? null,
  }
}

/** Нужно ли дозапрашивать волну: в очереди осталось ≤5 */
export function waveNeedsRefill(queueLength: number, remainingAfterCurrent: number): boolean {
  if (queueLength === 0) return true
  return remainingAfterCurrent <= 5
}

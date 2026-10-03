/**
 * KumaFlow 1.6.4 — Brain wave
 * wave/continue + seeds + publish (throttle 5с) + resume. Источник внутри SmartAutoDJ.
 */

import { brainFetch, brainGet, brainPost, brainRaw } from './brain-client'
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
  /** Первая метка настроения с мозга (server/app/api/wave.py:615) */
  mood?: string | null
  /** Все метки настроения трека (до 3) */
  moods?: string[]
}

let lastPublishAt = 0
let lastPublishKey = ''

/** ID сессии очереди: мозг различает «новая волна» vs «продолжение».
 * Живёт пока живёт очередь; сбрасывается при старте новой волны. */
let brainSessionId = ''
export function getBrainSessionId(): string {
  if (!brainSessionId) {
    try {
      brainSessionId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `sess-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    } catch {
      brainSessionId = `sess-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    }
  }
  return brainSessionId
}
export function resetBrainSessionId(): void {
  brainSessionId = ''
}

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
  /** Контекст воспроизведения: shuffle/loop/source/session_id (W1, сервер принимает опционально) */
  context?: Record<string, unknown>
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
    ...(opts.context && Object.keys(opts.context).length > 0
      ? { context: opts.context }
      : {}),
  })
  if (!res) return null
  if (typeof res.profile_version === 'number') st.setProfileVersion(res.profile_version)
  const tracks = (res.tracks ?? []).map((t) => ({
    ...t,
    moods: Array.isArray((t as WaveTrack).moods)
      ? (t as WaveTrack).moods
      : (t as WaveTrack).mood
        ? [(t as WaveTrack).mood as string]
        : [],
  }))
  return { tracks, seeds: res.seeds, profile_version: res.profile_version }
}

/** Каталог опций волны с мозга (GET /api/wave/options).
 * Мозг — канон списков; без мозга плеер работает по зашитым (офлайн). */
export interface WaveOptions {
  activities: { code: string; label: string; hint?: string }[]
  characteristics: { code: string; label: string; hint?: string }[]
  languages: { code: string; label: string }[]
  moods: { name: string; count: number }[]
}

export async function fetchWaveOptions(): Promise<WaveOptions | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return null
  try {
    const res = await brainGet<WaveOptions>(`/api/wave/options`)
    if (!res || !Array.isArray(res.activities)) return null
    return res
  } catch {
    return null
  }
}

/** Настроения с мозга: пинг waveContinue с пустой очередью,
 * забираем distinct mood-метки (как home_screen в мобайле).
 * count=40 (не 5): анализ библиотеки обычно частичный, и пятёрка
 * легко промахивается мимо размеченных треков — было «то есть, то нет».
 * Best-effort: мозг выкл → {reason:'off'}, continue не ответил
 * (401/403/сеть, детали в консоли [Brain]) → {reason:'unavailable'},
 * треки без mood_labels (нет sonic-анализа) → {reason:'empty'}. */
export async function fetchBrainMoods(): Promise<{
  moods: string[]
  reason: 'ok' | 'off' | 'unavailable' | 'empty' | 'error'
}> {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return { moods: [], reason: 'off' }
  try {
    const res = await waveContinue({ queue: [], count: 40 })
    if (!res) return { moods: [], reason: 'unavailable' }
    const out = new Set<string>()
    for (const t of res.tracks) {
      for (const m of t.moods ?? []) {
        const v = (m || '').trim().toLowerCase()
        if (v) out.add(v)
      }
      const single = (t.mood || '').trim().toLowerCase()
      if (single) out.add(single)
    }
    if (out.size === 0) {
      console.warn('[Brain] wave/continue 200, но mood/moods пустые — на сервере нет sonic-анализа (mood_labels)')
      return { moods: [], reason: 'empty' }
    }
    return { moods: [...out], reason: 'ok' }
  } catch {
    return { moods: [], reason: 'error' }
  }
}

export interface BrainSeed {
  kind: string
  ref: string
  label: string
  playlist_id?: string | null
  created_at?: string | null
}

/** Радио по сиду (W4): POST /api/wave/seed {kind: artist|track}.
 * Возвращает внутренние track_id мозга — резолвить в локальные
 * через GET /api/tracks/{id} → external_id → subsonic.getSong. */
export async function waveSeedStart(
  kind: 'artist' | 'track',
  ref: string,
): Promise<{ seed: BrainSeed | null; trackIds: string[]; playlistId?: string } | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return null
  const body: Record<string, unknown> =
    kind === 'artist'
      ? { user_id: st.userId, kind, artist_name: ref }
      : { user_id: st.userId, kind, track_id: ref }
  const res = await brainPost<{
    seed?: BrainSeed | null
    tracks?: string[]
    playlist_id?: string
  }>(`/api/wave/seed`, body)
  if (!res) return null
  return {
    seed: res.seed ?? null,
    trackIds: Array.isArray(res.tracks) ? res.tracks.filter(Boolean) : [],
    playlistId: res.playlist_id,
  }
}

/** Капсула «волна по X» для главной: GET /api/wave/seed → seed | null */
export async function waveSeedGet(): Promise<BrainSeed | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return null
  const q = new URLSearchParams({ user_id: st.userId })
  const res = await brainGet<{ seed?: BrainSeed | null }>(`/api/wave/seed?${q.toString()}`)
  return res?.seed ?? null
}

/** Сброс сида: DELETE /api/wave/seed (плейлист остаётся, волна снова обычная) */
export async function waveSeedClear(): Promise<boolean> {
  const st = useBrainStore.getState()
  if (!isBrainActive() || !st.userId) return false
  const q = new URLSearchParams({ user_id: st.userId })
  try {
    const r = await brainRaw(`/api/wave/seed?${q.toString()}`, { method: 'DELETE' })
    return !!r && r.status >= 200 && r.status < 300
  } catch {
    return false
  }
}

export interface BrainSimilarItem {
  track_id: string
  title: string
  artist_name: string
  score: number
  /** Navidrome song id — маппинг в локальную библиотеку без search() */
  external_id?: string | null
}

/** Похожие на трек с мозга (sonic-косинус + кластер + жанр + настроение).
 * Best-effort: мозг выкл/недоступен/не знает трек → null, вызывающий
 * откатывается на локальный vibe-скоринг. Без ретраев — для поповера. */
export async function recommendSimilarTracks(songId: string): Promise<BrainSimilarItem[] | null> {
  if (!isBrainActive() || !songId) return null
  const res = await brainFetch<{ items: BrainSimilarItem[] }>(
    `/api/analysis/recommend/by-track/${encodeURIComponent(songId)}`,
    { method: 'GET' },
    0,
  )
  if (!res || !Array.isArray(res.items)) return null
  return res.items
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

/** Резолв внутренних track_id сида в external_id (Navidrome) для плеера.
 * GET /api/tracks/{id} → external_id; concurrency 6, кап 60. */
export async function resolveSeedExternalIds(trackIds: string[]): Promise<string[]> {
  const ids = (trackIds ?? []).filter(Boolean).slice(0, 60)
  if (ids.length === 0) return []
  const out: (string | null)[] = new Array(ids.length).fill(null)
  let cursor = 0
  const worker = async () => {
    while (cursor < ids.length) {
      const i = cursor
      cursor += 1
      try {
        const t = await brainGet<{ external_id?: string | null; track_id?: string }>(
          `/api/tracks/${encodeURIComponent(ids[i])}`,
        )
        const ext = (t?.external_id || '').trim()
        out[i] = ext || ids[i]
      } catch {
        out[i] = ids[i]
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()])
  return (out.filter(Boolean) as string[]).slice(0, 60)
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

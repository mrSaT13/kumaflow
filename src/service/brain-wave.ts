/**
 * KumaFlow 1.6.2 — Brain wave
 * wave/continue + seeds + publish (throttle 5с). Источник внутри SmartAutoDJ.
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
 * иначе веб-зеркало показывает сыгранное как «дальше» и дубли. */
export function wavePublish(queue: string[], currentTrackId?: string | null): void {
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
  const now = Date.now()
  const key = `${st.userId}|${currentTrackId ?? ''}|${q.length}|${q.slice(0, 3).join(',')}`
  if (now - lastPublishAt < 5000 && key === lastPublishKey) return
  lastPublishAt = now
  lastPublishKey = key
  const payload = {
    user_id: st.userId,
    queue: q,
    current_track_id: currentTrackId ?? null,
  }
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

/** Нужно ли дозапрашивать волну: в очереди осталось ≤5 */
export function waveNeedsRefill(queueLength: number, remainingAfterCurrent: number): boolean {
  if (queueLength === 0) return true
  return remainingAfterCurrent <= 5
}

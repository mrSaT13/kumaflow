/**
 * KumaFlow 1.6.2 — Brain sync
 * provision user_id + sync-from-mobile страницами + flush events/rate/history.
 * Трек = external_id (Navidrome song id), артист = имя.
 */

import { brainGet, brainPost, isBrainConfigured } from './brain-client'
import { isBrainActive, useBrainStore } from '@/store/brain.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useAppStore } from '@/store/app.store'
import { useAuthStore } from '@/store/auth.store'
import { useMLStore } from '@/store/ml.store'

export interface BrainRating {
  external_id: string
  like: boolean | null
  playCount: number
  skipCount: number
  replayCount: number
  seekBackCount: number
  abandonCount: number
  score: number
  lastPlayed?: string
}

export type BrainAction = 'play' | 'complete' | 'skip' | 'replay' | 'seek_back' | 'abandon'

export interface BrainEvent {
  track_id: string
  action: BrainAction
  position_sec: number
}

function brainUserId(): string | null {
  return useBrainStore.getState().userId
}

interface BrainUser {
  id: string
  external_id: string
  username: string
}

/** Найти существующего юзера мозга по external_id (логин Navidrome) */
async function findBrainUser(externalId: string): Promise<string | null> {
  const list = await brainGet<{ users?: BrainUser[] }>(`/api/users/`).catch(() => null)
  const hit = list?.users?.find((u) => u.external_id === externalId)
  return hit?.id ?? null
}

/**
 * provision user_id: сначала ищем по external_id, потом создаём.
 * Идемпотентно, пароль не нужен. Левых имён не выдумываем.
 */
export async function ensureBrainUserId(externalId: string, username: string): Promise<string | null> {
  if (!isBrainActive() || !isBrainConfigured()) return null
  const cleanExt = externalId.trim()
  if (!cleanExt) return null
  const existing = brainUserId()
  // Проверяем что сохранённый userId всё ещё указывает на наш external_id
  if (existing) {
    const found = await findBrainUser(cleanExt)
    if (found) {
      if (found !== existing) useBrainStore.getState().setUserId(found)
      return found
    }
    // сохранённый id протух (например создан левым фолбеком) — ищем заново ниже
  }
  const found = await findBrainUser(cleanExt)
  if (found) {
    useBrainStore.getState().setUserId(found)
    return found
  }
  // Создаём (409 = уже есть → перечитываем список)
  const created = await brainPost<{ user?: { id: string } }>(`/api/users/`, {
    external_id: cleanExt,
    username: username.trim() || cleanExt,
  }).catch(() => null)
  const id = created?.user?.id ?? (await findBrainUser(cleanExt))
  if (id) useBrainStore.getState().setUserId(id)
  return id ?? null
}

/** sync-from-mobile страницами: ratings до 20000, events до 5000 за запрос */
export interface TasteSyncResult {
  ok?: boolean
  source?: string
  fav_added?: number
  error?: string
}

export async function syncFromMobile(
  ratings: BrainRating[],
  profile: Record<string, unknown>,
  events: BrainEvent[],
): Promise<TasteSyncResult | null> {
  const userId = brainUserId()
  if (!isBrainActive() || !userId) return null
  // Чанки с гарантией ≥1 итерации: пустые ratings/events — это тоже синк
  // (профиль должен долететь даже с нуля). Раньше пустые массивы давали
  // ноль итераций — POST не уходил, а тост врал «fav+0».
  const ratingChunks: BrainRating[][] = []
  for (let i = 0; i < ratings.length; i += 20000) ratingChunks.push(ratings.slice(i, i + 20000))
  if (ratingChunks.length === 0) ratingChunks.push([])
  const eventChunks: BrainEvent[][] = []
  for (let j = 0; j < events.length; j += 5000) eventChunks.push(events.slice(j, j + 5000))
  if (eventChunks.length === 0) eventChunks.push([])
  let result: TasteSyncResult | null = null
  for (const rc of ratingChunks) {
    for (const ec of eventChunks) {
      const r = await brainPost<TasteSyncResult>(
        `/api/users/${userId}/sync-from-mobile`,
        {
          source: 'desktop',
          ratings: rc,
          profile,
          events: ec.map((e) => ({
            track_id: e.track_id,
            action: e.action,
            position_sec: e.position_sec,
          })),
        },
      )
      if (r) result = r
    }
  }
  if (result) useBrainStore.getState().setLastSyncAt(new Date().toISOString())
  return result
}

/** best-effort отправка событий пачкой */
export async function reportBrainEvents(events: BrainEvent[]): Promise<{ auto_dislikes?: number; auto_bans?: string[] } | null> {
  const userId = brainUserId()
  if (!isBrainActive() || !userId || events.length === 0) return null
  return brainPost(`/api/users/${userId}/events`, {
    events: events.map((e) => ({ track_id: e.track_id, action: e.action, position_sec: e.position_sec })),
  })
}

export async function reportBrainRate(trackId: string, like: boolean | null) {
  const userId = brainUserId()
  if (!isBrainActive() || !userId) return null
  return brainPost(`/api/users/${userId}/rate`, { track_id: trackId, like })
}

export async function reportBrainHistory(trackId: string, playedAt: string) {
  const userId = brainUserId()
  if (!isBrainActive() || !userId) return null
  return brainPost(`/api/users/${userId}/history`, { track_id: trackId, played_at: playedAt })
}

export async function fetchBrainProfile(): Promise<Record<string, unknown> | null> {
  const userId = brainUserId()
  if (!isBrainActive() || !userId) return null
  return brainGet(`/api/users/${userId}/profile`)
}

/** Логин Navidrome для привязки user_id мозга. Пусто = синхру не стартуем. */
export function resolveNavidromeUsername(): string {
  try {
    const currentAccount = useAccountsStore.getState().getCurrentAccount?.()
    const appUsername = useAppStore.getState().data?.username
    const authUsername = useAuthStore.getState().username
    return (currentAccount?.username ?? appUsername ?? authUsername ?? '').trim()
  } catch {
    return ''
  }
}

export interface TasteSyncPayload {
  ratings: BrainRating[]
  profile: Record<string, unknown>
}

/** Общий сборщик payload вкусов из локального ML (ручной + автосинк). */
export function buildTasteSyncPayload(): TasteSyncPayload {
  const ml = useMLStore.getState()
  const ratings = Object.entries(ml.ratings ?? {}).slice(0, 20000).map(([external_id, r]) => {
    const v = r as { like?: boolean | null; playCount?: number; skipCount?: number; replayCount?: number; seekBackCount?: number; abandonCount?: number; score?: number; lastPlayed?: number | string }
    return {
      external_id,
      like: v.like ?? null,
      playCount: v.playCount ?? 0,
      skipCount: v.skipCount ?? 0,
      replayCount: v.replayCount ?? 0,
      seekBackCount: v.seekBackCount ?? 0,
      abandonCount: v.abandonCount ?? 0,
      score: v.score ?? 0,
      lastPlayed: typeof v.lastPlayed === 'number' ? new Date(v.lastPlayed).toISOString() : (v.lastPlayed as string | undefined),
    }
  })
  // Дизлайки по артистам из ratings (like===false → songInfo.artist).
  const artistDislikeCounts: Record<string, number> = {}
  for (const [, r] of Object.entries(ml.ratings ?? {})) {
    const v = r as { like?: boolean | null; songInfo?: { artist?: string } }
    const artist = (v.songInfo?.artist ?? '').trim()
    if (v.like === false && artist) {
      artistDislikeCounts[artist] = (artistDislikeCounts[artist] ?? 0) + 1
    }
  }
  const profile = {
    preferredGenres: ml.profile?.preferredGenres ?? {},
    preferredArtists: ml.profile?.preferredArtists ?? {},
    likedSongs: ml.profile?.likedSongs ?? [],
    dislikedSongs: ml.profile?.dislikedSongs ?? [],
    bannedArtists: ml.profile?.bannedArtists ?? [],
    artistDislikeCounts,
  }
  return { ratings, profile }
}

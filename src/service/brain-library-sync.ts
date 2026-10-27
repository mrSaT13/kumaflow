/**
 * KumaFlow 1.14.0 — Library Sync с мозгом.
 *
 * Подписки на артистов уходят в мозг (POST /api/library-sync/subscriptions),
 * а мозг через YM-загрузчик докачивает новинки и присылает уведомления
 * (kind=discovery, meta.tracks с точными Navidrome-id) — их показываем
 * тостами и точечно докачиваем в офлайн-кеш.
 *
 * Всё best-effort: без мозга/токена/юзер-id — тихо выходим, локальные
 * подписки и Last.fm/Apple-мониторинг продолжают работать как раньше.
 */

import { toast } from 'react-toastify'
import { brainFetch, brainGet, brainPost, isBrainConfigured } from './brain-client'
import { ensureBrainReady } from './brain-bootstrap'
import { isBrainActive, useBrainStore } from '@/store/brain.store'
import { cacheService } from './cache-service'

export interface BrainArrivalTrack {
  id: string
  title: string
  artist: string
}

export interface BrainNotification {
  id: string
  user_id: string | null
  kind: string
  title: string
  body: string | null
  link: string | null
  meta: { tracks?: BrainArrivalTrack[] } | null
  created_at: string | null
  read_at: string | null
}

const SEEN_KEY = 'brain-arrivals-seen-v1'
const SEEN_CAP = 200
const FIRST_DELAY_MS = 60_000
const INTERVAL_MS = 15 * 60_000

let started = false
let timer: ReturnType<typeof setInterval> | null = null

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeSeen(seen: Set<string>): void {
  try {
    const arr = [...seen].slice(-SEEN_CAP)
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr))
  } catch {
    /* ignore */
  }
}

async function brainUserId(): Promise<string | null> {
  const stored = useBrainStore.getState().userId
  if (stored) return stored
  return ensureBrainReady().catch(() => null)
}

/**
 * Подписка уходит в мозг: он ретранслирует её YM-загрузчику.
 * artistId — Navidrome artist id (мозг кладёт его в artist_external_id
 * для точного матчинга, без гадания по именам).
 */
export async function pushSubscriptionToBrain(artistId: string, artistName: string): Promise<void> {
  try {
    if (!isBrainActive() || !isBrainConfigured()) return
    const name = (artistName || '').trim()
    if (!name) return
    const uid = await brainUserId()
    if (!uid) return
    await brainPost('/api/library-sync/subscriptions', {
      user_id: uid,
      artist_name: name,
      artist_external_id: (artistId || '').trim() || undefined,
    })
  } catch {
    /* тихо — локальная подписка уже сохранена */
  }
}

/** Отписка в мозге (best-effort, ищем по имени + user_id). */
export async function removeSubscriptionFromBrain(artistId: string, artistName: string): Promise<void> {
  void artistId
  try {
    if (!isBrainActive() || !isBrainConfigured()) return
    const name = (artistName || '').trim()
    if (!name) return
    const uid = await brainUserId()
    await brainFetch('/api/library-sync/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ user_id: uid ?? undefined, artist_name: name }),
    })
  } catch {
    /* тихо — локальная отписка уже выполнена */
  }
}

/** Один опрос новинок: тосты + точечная докачка + пометка прочитанным. */
export async function pollBrainArrivals(): Promise<number> {
  if (!isBrainActive() || !isBrainConfigured()) return 0
  const uid = useBrainStore.getState().userId
  const qs = uid
    ? `/api/notifications/?user_id=${encodeURIComponent(uid)}&limit=50`
    : `/api/notifications/?limit=50&all=true`
  const data = await brainGet<{ notifications?: BrainNotification[] }>(qs).catch(() => null)
  const items = data?.notifications ?? []
  if (items.length === 0) return 0

  const seen = readSeen()
  let fresh = 0
  const online = typeof navigator === 'undefined' ? true : navigator.onLine

  for (const n of items) {
    if (!n || n.kind !== 'discovery' || n.read_at || seen.has(n.id)) continue
    seen.add(n.id)
    fresh++

    const tracks = n.meta?.tracks?.filter((t) => t && t.id) ?? []
    const suffix = tracks.length > 0 ? ` — ${tracks.length} тр. уже в библиотеке` : ''
    toast(`${n.title}${suffix}`, {
      type: 'info',
      autoClose: 20000,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    })

    // Точечная докачка в офлайн-кеш по точным id (без гадания по названиям).
    if (online && tracks.length > 0) {
      try {
        const ids = tracks.map((t) => t.id)
        await cacheService.cacheTracks(ids)
      } catch {
        /* тихо — треки уже в библиотеке, докачаем позже */
      }
    }

    try {
      await brainPost(`/api/notifications/${encodeURIComponent(n.id)}/read`, {})
    } catch {
      /* тихо */
    }
  }

  writeSeen(seen)
  return fresh
}

/** Фон: первый опрос через минуту (ждём bootstrap user_id), дальше каждые 15 мин. */
export function startBrainLibrarySyncLoop(): void {
  if (started) return
  started = true
  setTimeout(() => {
    pollBrainArrivals().catch(() => undefined)
    timer = setInterval(() => {
      pollBrainArrivals().catch(() => undefined)
    }, INTERVAL_MS)
  }, FIRST_DELAY_MS)
}

export function stopBrainLibrarySyncLoop(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

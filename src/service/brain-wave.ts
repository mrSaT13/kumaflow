/**
 * KumaFlow 1.6.2 — Brain wave
 * wave/continue + seeds + publish (throttle 5с). Источник внутри SmartAutoDJ.
 */

import { isBrainActive, useBrainStore } from '@/store/brain.store'
import { ensureBrainReady, requestBrainReady } from './brain-bootstrap'
import { brainGet, brainPost, brainRaw } from './brain-client'
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

// ==================== Устройство плеера ====================
// Мозг различает плееры по слоту device (см. server/app/api/wave.py
// _norm_device + /api/me/devices). Без него всё, что публикует десктоп,
// попадает в слот 'default' вместе с телефоном, и «Продолжить с …»
// на телефоне/вебе не знает, что играет у нас и с какой секунды.

const DEVICE_ID_KEY = 'brain_device_id'
const DEVICE_LABEL_KEY = 'brain_device_label'

/** Стабильный id слота: один раз сгенерирован — хранится навсегда.
 * Только [a-z0-9_-], максимум 32 символа (как ждёт мозг). */
export function brainDeviceId(): string {
  try {
    const existing = (localStorage.getItem(DEVICE_ID_KEY) || '')
      .trim()
      .toLowerCase()
    if (/^[a-z0-9_-]{4,32}$/.test(existing)) return existing
    const rand = (
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    )
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 16)
    const id = `pc-${rand}`
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return 'pc-default'
  }
}

/** Человекочитаемая метка плеера — её видно в селекторе волны и в «Продолжить с …». */
export function brainDeviceLabel(): string {
  try {
    const custom = (localStorage.getItem(DEVICE_LABEL_KEY) || '')
      .trim()
      .slice(0, 64)
    if (custom) return custom
  } catch {
    /* ignore */
  }
  const os =
    (globalThis as any).navigator?.userAgentData?.platform ||
    (globalThis as any).navigator?.platform ||
    ''
  let osName = 'ПК'
  const s = String(os).toLowerCase()
  if (s.includes('win')) osName = 'Windows'
  else if (s.includes('mac')) osName = 'Mac'
  else if (s.includes('linux')) osName = 'Linux'
  return `KumaFlow · ${osName}`
}

/** Похоже ли значение на технический идентификатор, а не на имя устройства. */
function looksLikeDeviceId(v: string): boolean {
  const s = v.trim().toLowerCase()
  if (!s) return true
  // UUID целиком: 8-4-4-4-12
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s))
    return true
  // наш формат слота: pc-<16 hex>
  if (/^pc-[a-z0-9_-]{4,32}$/.test(s)) return true
  // прочий длинный id без пробелов. Именно HEX: иначе под правило попадали бы
  // настоящие имена вроде «XiaomiRedmiNote13Pro» (20 символов, без пробелов).
  if (/^[0-9a-f_-]{16,}$/.test(s)) return true
  return false
}

/**
 * Человекочитаемое имя устройства для UI.
 *
 * Раньше здесь стояло `(d.display_name || d.device_id).slice(0, 40)`, и когда
 * мозг не отдавал display_name — в уведомление уезжал сырой id. Телефон
 * публикует полный UUID, поэтому пользователь видел
 * «Слушали на ab224530-57ca-4027-a4ce-780844fcc6b8». Технический id наружу
 * не выпускаем — возвращаем null, вызывающий подставит «Устройство N».
 */
export function humanDeviceName(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().slice(0, 40)
  if (!s || looksLikeDeviceId(s)) return null
  return s
}

export interface BrainDeviceRow {
  deviceId: string
  displayName: string
  ageSec: number | null
  queueLen: number
  paused: boolean
  nowPlaying: string | null
}

/**
 * Список живых слотов с человеческими именами.
 * Безымянные слоты нумеруются по порядку, чтобы в выпадающем списке
 * «Продолжить с …» было из чего выбирать.
 */
export function humanDeviceRows(
  raw: Array<{
    device_id?: string
    deviceId?: string
    display_name?: string | null
    age_sec?: number | null
    queue_len?: number | null
    paused?: boolean | null
    now_playing?: string | null
  }>,
): BrainDeviceRow[] {
  let auto = 0
  return raw.map((d) => {
    const name = humanDeviceName(d.display_name ?? d.device_id)
    if (name)
      return {
        deviceId: d.device_id ?? d.deviceId ?? '',
        displayName: name,
        ageSec: d.age_sec ?? null,
        queueLen: d.queue_len ?? 0,
        paused: !!d.paused,
        nowPlaying: d.now_playing ?? null,
      }
    auto += 1
    return {
      deviceId: d.device_id ?? d.deviceId ?? '',
      displayName: `Устройство ${auto}`,
      ageSec: d.age_sec ?? null,
      queueLen: d.queue_len ?? 0,
      paused: !!d.paused,
      nowPlaying: d.now_playing ?? null,
    }
  })
}

/** Своё имя устройства (то, что переименовывается в мозге). */
export async function brainDeviceRename(label: string): Promise<boolean> {
  const name = (label || '').trim().slice(0, 64)
  try {
    localStorage.setItem(DEVICE_LABEL_KEY, name)
  } catch {
    /* ignore */
  }
  const res = await brainRaw(
    `/api/me/devices/${encodeURIComponent(brainDeviceId())}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ display_name: name }),
    },
  )
  return !!res && res.status >= 200 && res.status < 300
}

export interface BrainDevice {
  device_id: string
  display_name: string
  renamed: boolean
  age_sec: number | null
  queue_len: number
  paused: boolean
  now_playing?: {
    title?: string | null
    artist_name?: string | null
    position_sec?: number | null
  } | null
  /** Природа ленты на этом слоте (мозг 0.3.2+). */
  is_wave?: boolean
  playlist_name?: string | null
}

/** GET /api/me/devices — живые слоты + имена. */
export async function brainDevices(): Promise<BrainDevice[]> {
  const st = useBrainStore.getState()
  // Живой список без user_id пустой — на всякий случай поднимаем его здесь,
  // чтобы первое открытие настроек/«Продолжить» уже работало.
  const uid = st.userId ?? (await ensureBrainReady())
  const q = uid ? `?user_id=${encodeURIComponent(uid)}` : ''
  const res = await brainGet<{ devices?: BrainDevice[] }>(`/api/me/devices${q}`)
  return res?.devices ?? []
}

export interface WaveResumeTrack {
  track_id: string
  title: string
  artist_name: string
  album_name?: string | null
  cover_art_id?: string | null
  external_id: string
  duration_sec?: number | null
}

/** Ответ GET /api/wave/resume (server/app/api/wave.py). */
export interface WaveResume {
  available: boolean
  reason?: string | null
  stale?: boolean
  age_sec?: number | null
  device?: string | null
  device_id?: string | null
  paused?: boolean
  track?: WaveResumeTrack | null
  position_sec?: number | null
  position_ratio?: number | null
  queue?: string[]
  devices?: BrainDevice[]
  /** Природа ленты — от мозга (0.3.2+). Без них очередь «просто очередь». */
  is_wave?: boolean
  playlist_name?: string | null
  wave_settings?: {
    activity?: string
    characteristic?: string
    mood?: string
    language?: string
  } | null
  /** Сид радио: трек или артист, которым открыта лента. */
  radio_seed?: string | null
}

/**
 * Продолжить с другого устройства: GET /api/wave/resume[?device=слот].
 * Без ?device мозг отдаёт самый свежий слот. user_id поднимается на лету —
 * раньше функция молча возвращала null, пока не откроют настройки.
 */
export async function waveResume(
  device?: string | null,
): Promise<WaveResume | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive()) return null
  const uid = st.userId ?? (await ensureBrainReady())
  if (!uid) return null
  const q = new URLSearchParams({ user_id: uid })
  if (device) q.set('device', device)
  return brainGet<WaveResume>(`/api/wave/resume?${q.toString()}`)
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
}): Promise<{
  tracks: WaveTrack[]
  seeds?: string[]
  profile_version?: number
} | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive()) return null
  const uid = st.userId ?? (await ensureBrainReady())
  if (!uid) return null
  const res = await brainPost<{
    tracks: WaveTrack[]
    seeds?: string[]
    profile_version?: number
    applied?: unknown
  }>(`/api/wave/continue`, {
    user_id: uid,
    queue: opts.queue ?? [],
    current_track_id: opts.currentTrackId ?? null,
    count: opts.count ?? 20,
    settings: opts.settings ?? {},
    exclude_ids: opts.excludeIds ?? [],
    // device обязателен: без него мозг не может пометить слот как «играет
    // волна», и принимающее устройство не отличит волну от плейлиста.
    device: brainDeviceId(),
    recent_events: (opts.recentEvents ?? []).map((e) => ({
      track_id: e.track_id,
      action: e.action,
      position_sec: e.position_sec,
    })),
    ratings_delta: opts.ratingsDelta ?? [],
    profile_version: st.profileVersion ?? undefined,
  })
  if (!res) return null
  if (typeof res.profile_version === 'number')
    st.setProfileVersion(res.profile_version)
  return {
    tracks: res.tracks ?? [],
    seeds: res.seeds,
    profile_version: res.profile_version,
  }
}

/**
 * Слушатели артиста из мозга — GET /api/library/artists/listeners.
 *
 * Мозг видит ВСЕХ пользователей (distinct user_id по истории за 30 дней),
 * а локальные рейтинги устройства дают 0–1. Возвращает null, если мозг
 * не подключён или не ответил — вызывающий код откатывается на локальный
 * подсчёт.
 */
export async function brainArtistListeners(
  artistId?: string,
  artistName?: string,
): Promise<{
  monthly_listeners: number
  plays_30d: number
  total_listeners: number
} | null> {
  if (!isBrainActive()) return null
  const q = new URLSearchParams()
  if (artistId?.trim()) q.set('artist_id', artistId.trim())
  if (artistName?.trim()) q.set('name', artistName.trim())
  if ([...q].length === 0) return null
  const res = await brainGet<{
    ok?: boolean
    monthly_listeners?: number
    plays_30d?: number
    total_listeners?: number
  }>(`/api/library/artists/listeners?${q.toString()}`)
  if (!res || res.ok === false) return null
  return {
    monthly_listeners: res.monthly_listeners ?? 0,
    plays_30d: res.plays_30d ?? 0,
    total_listeners: res.total_listeners ?? 0,
  }
}

export async function waveSeeds(
  characteristic?: string,
  limit = 5,
): Promise<string[]> {
  const st = useBrainStore.getState()
  if (!isBrainActive()) return []
  const uid = st.userId ?? (await ensureBrainReady())
  if (!uid) return []
  const q = new URLSearchParams({ user_id: uid, limit: String(limit) })
  if (characteristic) q.set('characteristic', characteristic)
  const res = await brainGet<{ seeds?: string[] }>(
    `/api/wave/seeds?${q.toString()}`,
  )
  return res?.seeds ?? []
}

/**
 * «Волна по артисту» / «Волна по треку» — POST /api/wave/seed.
 *
 * Мозг собирает очередь из треков сида + похожих артистов (6×15) +
 * серверного getSimilarSongs2, гоняет через общий скоринг волны и
 * раскладывает энергетической дугой. Дизлайки/баны режутся.
 *
 * Локальный generateArtistRadio так не умеет: он берёт top-10 треков
 * артиста, а похожие приходят только из `artists.getInfo`, который на
 * Navidrome без Last.fm-ключа отдаёт пустой similarArtist. Итог — в
 * очереди 10 треков одного артиста вместо радио.
 *
 * Возвращает null, если мозг не подключён или не ответил — вызывающий
 * код обязан уметь откатиться на локальный генератор.
 */
export async function waveSeedStart(opts: {
  kind: 'artist' | 'track'
  artistName?: string
  trackId?: string
}): Promise<{
  tracks: WaveTrack[]
  similarArtists: string[]
  serverUsed: boolean
} | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive()) return null
  const uid = st.userId ?? (await ensureBrainReady())
  if (!uid) return null
  const body: Record<string, string> = { user_id: uid, kind: opts.kind }
  if (opts.kind === 'artist') {
    if (!opts.artistName?.trim()) return null
    body.artist_name = opts.artistName.trim()
  } else {
    if (!opts.trackId) return null
    body.track_id = opts.trackId
  }
  const res = await brainPost<{
    items?: WaveTrack[]
    similar_artists?: string[]
    server_used?: boolean
  }>('/api/wave/seed', body)
  const tracks = res?.items ?? []
  if (tracks.length === 0) return null
  return {
    tracks,
    similarArtists: res?.similar_artists ?? [],
    serverUsed: !!res?.server_used,
  }
}

// ==================== Нормализация кодов: мозг ↔ плеер ====================
// Сервер отдаёт/понимает 'ru', локальный ml-wave-service ждёт 'russian'.
// Занятия/настроения/характеры у нас совпадают 1:1, различается только язык.

/** Ответ мозга → коды локального UI. */
export function fromBrainSettings(s: WaveSettings): WaveSettings {
  const lang = (s.language || '').trim().toLowerCase()
  return {
    activity: s.activity,
    characteristic: s.characteristic,
    mood: s.mood,
    language:
      lang === 'ru' || lang === 'russian' ? 'russian' : lang || undefined,
  }
}

/** Коды локального UI → ответ мозга. */
export function toBrainSettings(s: WaveSettings): WaveSettings {
  const lang = (s.language || '').trim().toLowerCase()
  return {
    activity: s.activity,
    characteristic: s.characteristic,
    mood: s.mood,
    language: lang === 'russian' ? 'ru' : lang || undefined,
  }
}

/** Общие настройки волны: GET /api/wave/settings?user_id= — читать при старте/открытии настроек. */
export async function waveSettingsGet(): Promise<{
  settings: WaveSettings
  version?: number
} | null> {
  const st = useBrainStore.getState()
  if (!isBrainActive()) return null
  const uid = st.userId ?? (await ensureBrainReady())
  if (!uid) return null
  const q = new URLSearchParams({ user_id: uid })
  const res = await brainGet<{ settings?: WaveSettings; version?: number }>(
    `/api/wave/settings?${q.toString()}`,
  )
  if (!res) return null
  return {
    settings: fromBrainSettings(res.settings ?? {}),
    version: res.version,
  }
}

/** Общие настройки волны: PUT /api/wave/settings — писать при смене пилюль. */
export async function waveSettingsPut(patch: WaveSettings): Promise<boolean> {
  const st = useBrainStore.getState()
  if (!isBrainActive()) return false
  const uid = st.userId ?? (await ensureBrainReady())
  if (!uid) return false
  const res = await brainPost<{ ok?: boolean }>(`/api/wave/settings`, {
    user_id: uid,
    settings: toBrainSettings(patch),
  })
  return !!res
}

export interface WaveOptions {
  activities: { code: string; label: string; hint?: string }[]
  characteristics: { code: string; label: string }[] | string[]
  languages: { code: string; label: string }[] | string[]
  moods: { name: string; count?: number }[] | string[]
}

/** Канон опций волны с сервера: GET /api/wave/options (активности/характеры/языки/живые настроения). */
export async function waveOptions(): Promise<WaveOptions | null> {
  if (!isBrainActive()) return null
  const res = await brainGet<WaveOptions & { ok?: boolean }>(
    `/api/wave/options`,
  )
  if (!res) return null
  return res
}

/** Живая очередь: fire-and-forget, throttle 5с, одинаковый ключ не шлём.
 * Шлём только вперёд от текущего (без истории) + интра-дедуп по id,
 * иначе веб-зеркало показывает сыгранное как «дальше» и дубли. */
export function wavePublish(
  queue: string[],
  currentTrackId?: string | null,
  playback?: { positionSec?: number; durationSec?: number; paused?: boolean },
  /** Что это за лента: имя плейлиста и признак «это Моя волна». */
  context?: { playlistName?: string | null; isWave?: boolean },
): void {
  const st = useBrainStore.getState()
  if (!isBrainActive()) return
  if (!st.userId) {
    // user_id ещё не поднят — поднимаем и ждём следующего тика. Раньше здесь
    // был просто return, и «Продолжить с …» не видело ничего без настроек.
    requestBrainReady()
    return
  }
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
    // Стабильный слот устройства: без него телефон и десктоп затирают
    // слот 'default' друг друга, а «Продолжить с …» не видит, что играет ПК.
    device: brainDeviceId(),
    // position_sec — это и есть handoff: другое устройство продолжит с него
    position_sec: playback?.positionSec,
    duration_sec: playback?.durationSec,
    paused: playback?.paused,
    // Природа ленты. Без этого принимающее устройство получало только треки
    // и не понимало, что продолжает Мою волну: isMyWave в плеере становился
    // false, шапка волны показывала «Воспроизвести», а открытия не писались.
    // Мозг может эти поля игнорировать — плеер умеет восстанавливать волну
    // и по пересечению id с локальным my-wave-last.
    playlist_name: context?.playlistName ?? null,
    is_wave: context?.isWave ?? false,
  }
  void (async () => {
    const res = await brainRaw(`/api/wave/publish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!res) {
      st.setLastPublish(
        new Date().toISOString(),
        false,
        'network error / no response',
      )
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
export function waveNeedsRefill(
  queueLength: number,
  remainingAfterCurrent: number,
): boolean {
  if (queueLength === 0) return true
  return remainingAfterCurrent <= 5
}

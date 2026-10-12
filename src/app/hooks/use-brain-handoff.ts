/**
 * KumaFlow 1.7.3 — «Продолжить с …»: забрать живую очередь с другого устройства.
 *
 * waveResume() в brain-wave.ts был написан, но не вызывался ни разу — UI не
 * было, хотя сервер (/api/wave/resume) уже отдаёт трек, позицию и хвост
 * очереди. Хук опрашивает живые слоты (/api/me/devices), отбрасывает свой
 * device_id и даёт кнопку «Продолжить с …» для ховера карточки «Моя волна».
 *
 * Опрос 30с: телефон успевает прислать очередь, но не жрёт трафик.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { useBrainStore } from '@/store/brain.store'
import { usePlayerActions, usePlayerStore } from '@/store/player.store'
import { brainDeviceId, brainDevices, humanDeviceName, waveResume } from '@/service/brain-wave'
import { adoptWaveQueue, isWavePlaylistName, saveWaveContext } from '@/service/wave-identity'
import { waveLabel } from '@/app/components/homepage/my-wave-settings'
import { subsonic } from '@/service/subsonic'
import type { ISong } from '@/types/responses/song'

const POLL_MS = 30_000
/** Больше мозг не отдаёт (queue: rest[:50]) — держим запас для текущего трека. */
const MAX_QUEUE = 60
/** Пачками по 6: 50 треков = ~9 запросов вместо 50 последовательных. */
const RESOLVE_BATCH = 6
/** Позиция короче — не seek'им, иначе «продолжить» стартует с 0:03. */
const MIN_SEEK_SEC = 5

export interface HandoffDevice {
  deviceId: string
  displayName: string
  ageSec: number | null
  queueLen: number
  paused: boolean
  nowPlaying: string | null
}

export interface HandoffTarget {
  deviceId: string
  available: boolean
  stale: boolean
  trackTitle: string | null
  artistName: string | null
  positionSec: number | null
  durationSec: number | null
  queueLen: number
}

export interface BrainHandoff {
  /** Мозг включён — иначе показывать нечего. */
  enabled: boolean
  /** Живые слоты других устройств (свой исключён). */
  devices: HandoffDevice[]
  /** Выбранный слот + что он сейчас играет. */
  target: HandoffTarget | null
  selectedId: string | null
  select: (deviceId: string) => void
  resume: (deviceId?: string | null) => Promise<boolean>
  resuming: boolean
}

function toDevice(
  d: {
    device_id: string
    display_name: string
    age_sec: number | null
    queue_len: number
    paused: boolean
    now_playing?: { title?: string | null; artist_name?: string | null } | null
  },
  /** Порядковый номер для безымянных слотов: «Устройство 1», «Устройство 2». */
  index = 0,
): HandoffDevice {
  const np = d.now_playing
  return {
    deviceId: d.device_id,
    // display_name у телефона приходит UUID — наружу такое выпускать нельзя.
    displayName: humanDeviceName(d.display_name) ?? `Устройство ${index + 1}`,
    ageSec: d.age_sec,
    queueLen: d.queue_len,
    paused: !!d.paused,
    nowPlaying: np?.title
      ? `${np.artist_name ? `${np.artist_name} — ` : ''}${np.title}`
      : null,
  }
}

export function useBrainHandoff(): BrainHandoff {
  const { setSongList, setProgress } = usePlayerActions()
  const enabled = useBrainStore((s) => s.enabled && s.baseUrl.trim().length > 0)
  const [devices, setDevices] = useState<HandoffDevice[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [target, setTarget] = useState<HandoffTarget | null>(null)
  const [resuming, setResuming] = useState(false)
  const busy = useRef(false)

  // Слоты: /api/me/devices — там имена и now_playing для всех живых плееров.
  useEffect(() => {
    if (!enabled) {
      setDevices([])
      setSelectedId(null)
      return
    }
    let cancelled = false

    const poll = async () => {
      const list = await brainDevices().catch(() => null)
      if (cancelled || !list) return
      const me = brainDeviceId()
      const others = list
        // Молчащие слоты (age_sec === null) и пустые очереди продолжать нечем.
        .filter((d) => d.device_id !== me && d.age_sec != null && d.queue_len > 0)
        .map((d, i) => toDevice(d, i))
      if (cancelled) return
      setDevices(others)
      setSelectedId((cur) =>
        cur && others.some((d) => d.deviceId === cur) ? cur : (others[0]?.deviceId ?? null),
      )
    }

    poll().catch(() => undefined)
    const timer = setInterval(() => {
      poll().catch(() => undefined)
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled])

  // Содержимое выбранного слота: трек + позиция + хвост очереди.
  useEffect(() => {
    if (!enabled || !selectedId) {
      setTarget(null)
      return
    }
    let cancelled = false

    const load = async () => {
      const r = await waveResume(selectedId).catch(() => null)
      if (cancelled || !r) return
      const tr = r.track
      setTarget({
        deviceId: r.device_id || selectedId,
        available: !!r.available && !!tr,
        stale: !!r.stale,
        trackTitle: tr?.title ?? null,
        artistName: tr?.artist_name ?? null,
        positionSec: typeof r.position_sec === 'number' ? r.position_sec : null,
        durationSec: tr?.duration_sec ?? null,
        queueLen: (r.queue?.length ?? 0) + (tr ? 1 : 0),
      })
    }

    load().catch(() => undefined)
    const timer = setInterval(() => {
      load().catch(() => undefined)
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled, selectedId])

  const select = useCallback((deviceId: string) => {
    setSelectedId(deviceId)
  }, [])

  const resume = useCallback(
    async (deviceId?: string | null) => {
      const id = deviceId || selectedId
      if (!id || busy.current) return false
      busy.current = true
      setResuming(true)
      try {
        const r = await waveResume(id).catch(() => null)
        const tr = r?.track
        if (!r || !r.available || !tr) {
          toast.error(r?.reason || 'Устройство не отдало очередь (молчит или TTL истёк)')
          return false
        }

        const ids = [tr.external_id || tr.track_id, ...(r.queue ?? [])]
          .filter(Boolean)
          .slice(0, MAX_QUEUE)
        const songs: ISong[] = []
        for (let i = 0; i < ids.length; i += RESOLVE_BATCH) {
          const chunk = ids.slice(i, i + RESOLVE_BATCH)
          const got = await Promise.all(
            chunk.map((x) => subsonic.songs.getSong(x).catch(() => null)),
          )
          for (const s of got) {
            if (s) songs.push(s)
          }
        }
        if (songs.length === 0) {
          toast.error('Треки с устройства не нашлись в твоей библиотеке')
          return false
        }

        const pos =
          typeof r.position_sec === 'number' && r.position_sec >= MIN_SEEK_SEC
            ? Math.floor(r.position_sec)
            : 0

        const dev = devices.find((d) => d.deviceId === id)?.displayName ?? 'устройства'

        // Природу ленты берём у МОЗГА, а не угадываем по составу очереди.
        // Угадывание не работало: my-wave-last на этом устройстве хранит
        // ПРОШЛУЮ волну, телефон сгенерировал новую, пересечение выходило 0
        // из 17 — и isMyWave оставался false.
        const fromBrainWave = !!r.is_wave
        const brainName = (r.playlist_name ?? '').trim()
        // is_wave от мозга — источник истины. Имя может быть любым
        // («Продолжить · SamsungS10+»), а isMyWave проверяет именно его.
        // Поэтому при подтверждённой волне метку добавляем принудительно,
        // иначе шапка снова напишет «Моя коллекция».
        const resolvedName = fromBrainWave
          ? (isWavePlaylistName(brainName)
              ? brainName
              : `${brainName || `Продолжить · ${dev}`} · Моя волна`)
          : (brainName || `Продолжить · ${dev}`)

        const { playlistName, detection } = adoptWaveQueue(
          songs.map((s) => s.id),
          resolvedName,
        )
        if (fromBrainWave) {
          // Настройки волны едут с мозга — показываем их на этом устройстве.
          if (r.wave_settings) {
            const s = r.wave_settings
            const hint = [s.activity, s.characteristic, s.mood, s.language]
              .filter(Boolean)
              .map((v) => waveLabel(String(v)))
              .filter(Boolean)
              .join(' • ')
            if (hint) saveWaveContext(songs.map((x) => x.id), hint, 'brain')
          } else {
            saveWaveContext(songs.map((x) => x.id), '', 'brain')
          }
          console.log(`[BrainHandoff] Моя волна по данным мозга: "${playlistName}"`)
        } else {
          console.log(
            `[BrainHandoff] не волна (${detection.isWave ? 'похоже' : 'обычная очередь'}` +
              `, пересечение ${(detection.overlap * 100).toFixed(0)}%)`,
          )
        }
        setSongList(songs, 0, false, undefined, playlistName)
        // setSongList сбрасывает прогресс, поэтому позицию ставим сразу после:
        // setupDuration (onLoadedMetadata) подхватит её и прыгнет на нужную секунду.
        if (pos > 0) setProgress(pos)

        // Тот же трек уже загружен — loadedmetadata не придёт, seek'нем напрямую.
        if (pos > 0) {
          window.setTimeout(() => {
            const audio = usePlayerStore.getState().playerState.audioPlayerRef
            if (audio && audio.duration > 0 && Math.abs(audio.currentTime - pos) > 3) {
              audio.currentTime = pos
            }
          }, 400)
        }

        const from = pos > 0 ? ` с ${Math.floor(pos / 60)}:${String(pos % 60).padStart(2, '0')}` : ''
        toast.success(`Продолжаем с «${dev}»${from} · ${songs.length} треков`, { autoClose: 2500 })
        return true
      } catch (e) {
        console.error('[BrainHandoff] resume failed:', e)
        toast.error('Не удалось продолжить с устройства')
        return false
      } finally {
        busy.current = false
        setResuming(false)
      }
    },
    [devices, selectedId, setSongList, setProgress],
  )

  return {
    enabled,
    devices,
    target,
    selectedId,
    select,
    resume,
    resuming,
  }
}

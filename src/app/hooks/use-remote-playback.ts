import { useCallback, useEffect, useState } from 'react'

import { isBrainActive } from '@/store/brain.store'
import { usePlayerActions } from '@/store/player.store'
import { subsonic } from '@/service/subsonic'
import type { ISong } from '@/types/responses/song'
import { isArtistBanned } from '@/service/ban-filter'
import { adoptWaveQueue } from '@/service/wave-identity'
import { useMLStore } from '@/store/ml.store'
import {
  brainDeviceId,
  brainDeviceLabel,
  waveResume,
  type WaveResume,
  type WaveResumeTrack,
} from '@/service/brain-wave'

/**
 * Продолжить прослушивание с другого устройства.
 *
 * Мозг отдаёт текущий трек, позицию и очередь по слоту устройства. Раньше
 * waveResume() существовал, но кнопки в UI не было — функция была мёртвой.
 *
 * Логика намеренно переиспользует brain-autodj: слот нужно превратить в
 * ISong через локальную библиотеку по external_id, потому что очередь
 * плеера состоит из локальных id.
 */
export interface RemotePlayback {
  track: WaveResumeTrack
  positionSec: number
  device: string | null
  ageSec: number | null
  queue: string[]
}

export function useRemotePlayback() {
  const [remote, setRemote] = useState<RemotePlayback | null>(null)
  const [busy, setBusy] = useState(false)
  const setSongList = usePlayerActions().setSongList
  const bannedArtists = useMLStore((state) => state.profile.bannedArtists) || []

  const refresh = useCallback(async () => {
    if (!isBrainActive()) {
      setRemote(null)
      return
    }
    const res: WaveResume | null = await waveResume(null)
    if (!res || !res.available || !res.track) {
      setRemote(null)
      return
    }

    // Мозг отдаёт самый свежий слот — а мы публикуем в него СВОЮ же очередь
    // (см. wavePublish в App.tsx). Без этой проверки баннер «Продолжить с
    // другого устройства» появлялся про это же самое устройство и висел:
    // dismiss прятал его, но refresh через 30 секунд ставил обратно.
    const me = brainDeviceId()
    const meLabel = brainDeviceLabel()
    const slot = res.device ?? res.device_id ?? null
    if (slot === me || slot === meLabel) {
      setRemote(null)
      return
    }

    setRemote({
      track: res.track,
      positionSec: res.position_sec ?? 0,
      device: res.device ?? res.device_id ?? null,
      ageSec: res.age_sec ?? null,
      queue: res.queue ?? [],
    })
  }, [])

  // Слот живёт 600 секунд, поэтому опрашиваем нечасто.
  useEffect(() => {
    if (!isBrainActive()) {
      setRemote(null)
      return
    }
    void refresh()
    const id = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(id)
  }, [refresh])

  const takeOver = useCallback(async () => {
    if (!remote) return
    setBusy(true)
    try {
      const ids = [remote.track.external_id, ...remote.queue]
      const songs: ISong[] = []

      for (const ext of ids) {
        const song = await resolveSong(ext)
        if (!song) continue
        if (isArtistBanned(song.artistId, song.artist, bannedArtists)) continue
        songs.push(song)
      }

      if (songs.length === 0) {
        setRemote(null)
        return
      }

      // Природу ленты восстанавливаем ДО setSongList: имя из handoff обрезано
      // до «С другого устройства», поэтому isMyWave по имени не срабатывал.
      // adoptWaveQueue смотрит и имя, и пересечение id с my-wave-last, а к
      // волне дописывает метку, чтобы проверка по имени тоже прошла.
      const { playlistName } = adoptWaveQueue(
        songs.map((s) => s.id),
        'С другого устройства',
      )
      if (/моя волна|mywave|my wave/i.test(playlistName)) {
        console.log('[RemoteHandoff] очередь распознана как Моя волна:', playlistName)
      }
      setSongList(songs, 0, false, undefined, playlistName)
      // Позицию ставим после смены src, иначе элемент её сбросит.
      const target = Math.max(0, remote.positionSec)
      const el = document.querySelector('audio')
      if (el && target > 0) {
        const seek = () => {
          if (Number.isFinite(el.duration)) el.currentTime = target
        }
        el.addEventListener('loadedmetadata', seek, { once: true })
        setTimeout(seek, 400)
        setTimeout(() => el.removeEventListener('loadedmetadata', seek), 4000)
      }
      setRemote(null)
    } finally {
      setBusy(false)
    }
  }, [remote, bannedArtists, setSongList])

  return { remote, busy, refresh, takeOver, dismiss: () => setRemote(null) }
}

async function resolveSong(externalId: string) {
  try {
    const got = await subsonic.songs.getSong(externalId)
    return got ?? null
  } catch {
    return null
  }
}
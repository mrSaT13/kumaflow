import { useEffect, useRef } from 'react'
import { usePlayerStore } from '@/store/player.store'
import { useML } from '@/store/ml.store'
import { scrobble } from '@/service/scrobble'
import { usePlaybackSettings } from '@/store/playback.store'
import { trackEvent } from '@/service/ml-event-tracker'
import { updateSonicFingerprint } from '@/service/sonic-fingerprint'

const TOTAL_PLAYS_KEY = 'kumaflow_total_plays'

/**
 * Хук для автоматического scrobble в Navidrome
 * Отправляет данные о прослушивании когда трек прослушан больше порога
 */
export function useAutoScrobble() {
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const isPlaying = usePlayerStore((state) => state.playerState.isPlaying)
  const progress = usePlayerStore((state) => state.playerProgress.progress)
  const { settings } = usePlaybackSettings()
  const { incrementPlayCount, recordReplay, calculateTrackScore, calculateNoveltyScore, updateLastPlayed } = useML()

  const scrobbledRef = useRef<Set<string>>(new Set())
  const startTimeRef = useRef<number | null>(null)
  const lastSongIdRef = useRef<string | null>(null)
  const playCountRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!settings.scrobbleEnabled || !currentSong?.id) return

    const songId = currentSong.id

    // Если трек изменился, сбрасываем состояние
    if (songId !== lastSongIdRef.current) {
      scrobbledRef.current.delete(songId)
      startTimeRef.current = Date.now()
      lastSongIdRef.current = songId
      playCountRef.current[songId] = (playCountRef.current[songId] || 0) + 1
      
      // Если это повтор трека → сильный сигнал!
      if (playCountRef.current[songId] > 1) {
        recordReplay(songId)
        console.log(`[AutoScrobble] Replay detected for ${currentSong.title}`)
      }
      
      return
    }

    // Если трек уже отправлен, пропускаем
    if (scrobbledRef.current.has(songId)) return

    // Проверяем сколько секунд прослушано
    if (startTimeRef.current) {
      const elapsed = (Date.now() - startTimeRef.current) / 1000

      if (elapsed >= settings.scrobbleThresholdSeconds) {
        // Отправляем scrobble в Navidrome и Last.fm
        scrobble.sendSubmission({
          id: songId,
          artist: currentSong.artist,
          title: currentSong.title,
          album: currentSong.album,
          duration: currentSong.duration,
        })
        scrobbledRef.current.add(songId)

        // Увеличиваем счетчик в ML store с scoring
        incrementPlayCount(songId, (progress / currentSong.duration) * 100)
        
        // Обновляем last played с temporal patterns
        updateLastPlayed(songId)

        // 🎵 ОБНОВЛЯЕМ SONIC FINGERPRINT (автоматически!)
        updateSonicFingerprint(songId, {
          energy: currentSong.energy,
          danceability: currentSong.danceability,
          valence: currentSong.valence,
          acousticness: currentSong.acousticness,
          bpm: currentSong.bpm,
          genre: currentSong.genre,
        }).catch(err => console.error('[SonicFingerprint] Error:', err))

        // Увеличиваем общий счетчик прослушиваний
        const currentTotal = parseInt(localStorage.getItem(TOTAL_PLAYS_KEY) || '0')
        localStorage.setItem(TOTAL_PLAYS_KEY, (currentTotal + 1).toString())

        // Рассчитываем score и novelty
        const score = calculateTrackScore(songId)
        const novelty = calculateNoveltyScore(songId)

        console.log(`[AutoScrobble] ✅ Scrobble: ${currentSong.title}`)
        console.log(`  Score: ${score}, Novelty: ${novelty.toFixed(3)}`)

        // Трекаем событие
        trackEvent('scrobble_sent', { 
          songId, 
          songTitle: currentSong.title,
          score,
          novelty,
          playCount: playCountRef.current[songId],
        })

        // Трекаем первый трек
        if (currentTotal === 0) {
          trackEvent('first_track_played', { songId, songTitle: currentSong.title })
        }

        console.log(`📊 Всего прослушиваний: ${currentTotal + 1}`)
      }
    }
  }, [progress, currentSong, isPlaying, settings.scrobbleEnabled, settings.scrobbleThresholdSeconds, incrementPlayCount, recordReplay, calculateTrackScore, calculateNoveltyScore, updateLastPlayed])

  // Сброс при остановке
  useEffect(() => {
    if (!isPlaying) {
      startTimeRef.current = null
    }
  }, [isPlaying])
}

/**
 * Получить общее количество прослушиваний
 */
export function getTotalPlays(): number {
  return parseInt(localStorage.getItem(TOTAL_PLAYS_KEY) || '0')
}

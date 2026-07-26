import { useEffect, useRef } from 'react'
import { usePlayerIsPlaying, usePlayerSonglist } from '@/store/player.store'
import { audiobookshelfService } from '@/service/audiobookshelf-api'
import {
  ensureSessionStarted,
  HEARTBEAT_INTERVAL_MS,
  invalidateAppSession,
  isSessionExpiredWhileIdle,
  recordHeartbeat,
  touchUserActivity,
} from '@/service/app-session'

export function AppSessionObserver() {
  const isPlaying = usePlayerIsPlaying()
  const { currentSong } = usePlayerSonglist()
  const isPlayingRef = useRef(isPlaying)
  const currentSongRef = useRef(currentSong)

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    currentSongRef.current = currentSong
  }, [currentSong])

  useEffect(() => {
    ensureSessionStarted()

    const onActivity = () => touchUserActivity()
    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
    ]

    activityEvents.forEach((event) => {
      window.addEventListener(event, onActivity, { passive: true })
    })

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlayingRef.current) {
        touchUserActivity()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const heartbeat = window.setInterval(() => {
      recordHeartbeat(isPlayingRef.current)

      const song = currentSongRef.current as
        | (typeof currentSongRef.current & {
            isAudiobook?: boolean
            audiobookData?: { bookId?: string }
          })
        | null

      if (
        isPlayingRef.current &&
        song?.isAudiobook &&
        song.audiobookData?.bookId
      ) {
        audiobookshelfService.keepPlaybackSessionAlive(song.audiobookData.bookId)
      }
    }, HEARTBEAT_INTERVAL_MS)

    const expiryCheck = window.setInterval(() => {
      if (isSessionExpiredWhileIdle(isPlayingRef.current)) {
        invalidateAppSession()
      }
    }, 60_000)

    recordHeartbeat(isPlayingRef.current)

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, onActivity)
      })
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearInterval(heartbeat)
      window.clearInterval(expiryCheck)
    }
  }, [])

  return null
}

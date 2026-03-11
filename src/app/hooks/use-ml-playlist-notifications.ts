import { useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import { useML } from '@/store/ml.store'
import { useMLPlaylistsStateActions } from '@/store/ml-playlists-state.store'
import { checkAndUpdatePlaylist } from '@/service/ml-wave-service'

/**
 * Хук для автообновления плейлистов и уведомлений
 */
export function useMLPlaylistNotifications() {
  const { getProfile } = useML()
  const { addPlaylist, shouldRegenerate } = useMLPlaylistsStateActions()

  // Флаг чтобы избежать дублирования
  const notifiedRef = useRef({
    'daily-mix': false,
    'discover-weekly': false,
  })

  useEffect(() => {
    // Проверяем каждый час
    const interval = setInterval(() => {
      checkAndUpdatePlaylists()
    }, 60 * 60 * 1000) // 1 час

    // Первая проверка при загрузке (с задержкой)
    const timeout = setTimeout(() => {
      checkAndUpdatePlaylists()
    }, 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  async function checkAndUpdatePlaylists() {
    const profile = getProfile()
    const likedSongIds = profile.likedSongs
    const preferredGenres = profile.preferredGenres

    // Проверяем Daily Mix
    if (shouldRegenerate('daily-mix')) {
      try {
        const result = await checkAndUpdatePlaylist(
          'daily-mix',
          likedSongIds,
          preferredGenres,
          undefined,
          24
        )

        if (result && result.updated) {
          addPlaylist({
            id: result.metadata.id,
            type: 'daily-mix',
            name: result.metadata.name,
            description: result.metadata.description,
            songs: result.playlist.songs,
            createdAt: result.metadata.createdAt,
            expiresAt: result.metadata.expiresAt,
          })

          if (!notifiedRef.current['daily-mix']) {
            toast('🎵 Ежедневный микс обновлён', {
              type: 'success',
              autoClose: 5000,
              toastId: 'daily-mix',
            })
            notifiedRef.current['daily-mix'] = true
          }
        }
      } catch (error) {
        console.error('Ошибка обновления Daily Mix:', error)
      }
    }

    // Проверяем Discover Weekly (раз в неделю)
    if (shouldRegenerate('discover-weekly')) {
      try {
        const result = await checkAndUpdatePlaylist(
          'discover-weekly',
          likedSongIds,
          preferredGenres,
          undefined,
          168 // 7 дней
        )

        if (result && result.updated) {
          addPlaylist({
            id: result.metadata.id,
            type: 'discover-weekly',
            name: result.metadata.name,
            description: result.metadata.description,
            songs: result.playlist.songs,
            createdAt: result.metadata.createdAt,
            expiresAt: result.metadata.expiresAt,
          })

          if (!notifiedRef.current['discover-weekly']) {
            toast('🌟 Открытия недели обновлены', {
              type: 'success',
              autoClose: 5000,
              toastId: 'discover-weekly',
            })
            notifiedRef.current['discover-weekly'] = true
          }
        }
      } catch (error) {
        console.error('Ошибка обновления Discover Weekly:', error)
      }
    }
  }
}

/**
 * Хук для автоматического кеширования лайкнутых треков
 */

import { useEffect } from 'react'
import { cacheService } from '@/service/cache-service'
import { usePlayerStore } from '@/store/player.store'

interface UseAutoCacheTracksProps {
  enabled: boolean  // Включено ли автосохранение
  maxTracks?: number  // Максимум треков для кеширования
}

export function useAutoCacheTracks({ enabled, maxTracks = 100 }: UseAutoCacheTracksProps) {
  const { currentList, currentSong } = usePlayerStore()

  useEffect(() => {
    console.log('[AutoCache] Hook effect triggered:', { 
      enabled, 
      currentSongId: currentSong?.id, 
      currentSongTitle: currentSong?.title,
      starred: currentSong?.starred 
    })

    if (!enabled) {
      console.log('[AutoCache] Disabled, skipping')
      return
    }

    // Кешируем текущий трек если он лайкнутый
    if (currentSong) {
      const isStarred = typeof currentSong.starred === 'string'
      console.log('[AutoCache] Current song starred check:', { 
        isStarred, 
        starredValue: currentSong.starred,
        starredType: typeof currentSong.starred 
      })
      
      if (isStarred) {
        console.log('[AutoCache] Caching starred track:', currentSong.title, currentSong.id)
        cacheService.cacheTracks([currentSong.id])
          .then(count => console.log('[AutoCache] Cached count:', count))
          .catch(err => console.error('[AutoCache] Cache error:', err))
      }
    }
  }, [currentSong?.id, enabled])

  // Периодическое кеширование лайкнутых из очереди
  useEffect(() => {
    console.log('[AutoCache] Queue effect triggered:', { 
      enabled, 
      currentListLength: currentList?.length 
    })

    if (!enabled || !currentList || currentList.length === 0) {
      console.log('[AutoCache] No queue or disabled, skipping')
      return
    }

    const interval = setInterval(() => {
      // Находим лайкнутые треки в очереди
      const starredTracks = currentList.filter(song => {
        const isStarred = typeof song.starred === 'string'
        if (isStarred) {
          console.log('[AutoCache] Found starred track in queue:', song.title, song.id)
        }
        return isStarred
      })

      console.log('[AutoCache] Found starred tracks in queue:', starredTracks.length)

      if (starredTracks.length > 0) {
        // Берем первые N треков
        const toCache = starredTracks.slice(0, maxTracks).map(s => s.id)
        console.log(`[AutoCache] Caching ${toCache.length} starred tracks from queue`)
        cacheService.cacheTracks(toCache)
          .then(count => console.log('[AutoCache] Cached from queue:', count))
          .catch(err => console.error('[AutoCache] Queue cache error:', err))
      }
    }, 60 * 1000) // Каждую минуту

    return () => {
      console.log('[AutoCache] Clearing interval')
      clearInterval(interval)
    }
  }, [currentList, enabled, maxTracks])
}

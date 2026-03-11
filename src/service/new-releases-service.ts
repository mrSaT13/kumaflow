/**
 * Сервис для генерации плейлиста "Новинки подписок"
 * 
 * Использует данные из artist-track-monitor
 * Генерирует плейлист из новых треков подписанных артистов
 */

import { subsonic } from '@/service/subsonic'
import { artistTrackMonitor } from '@/service/artist-track-monitor'
import { useArtistSubscriptionsStore } from '@/store/artist-subscriptions.store'
import type { ISong } from '@/types/responses/song'

export interface NewReleasesPlaylist {
  songs: ISong[]
  totalCount: number
  lastUpdated: number
}

/**
 * Сгенерировать плейлист новинок
 */
export async function generateNewReleasesPlaylist(
  limit: number = 25
): Promise<NewReleasesPlaylist> {
  const { subscriptions } = useArtistSubscriptionsStore.getState()
  
  if (subscriptions.length === 0) {
    console.log('[NewReleases] Нет подписок')
    return {
      songs: [],
      totalCount: 0,
      lastUpdated: Date.now(),
    }
  }
  
  console.log('[NewReleases] Generating playlist for', subscriptions.length, 'artists')
  
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  
  // Для каждого подписанного артиста
  for (const subscription of subscriptions) {
    try {
      // Получаем треки артиста из Navidrome
      const artistSongs = await subsonic.songs.getByArtist(subscription.artistId)
      
      if (!artistSongs) continue
      
      // Сортируем по дате добавления (новые первые)
      const sortedSongs = [...artistSongs].sort((a, b) => {
        const dateA = a.created ? new Date(a.created).getTime() : 0
        const dateB = b.created ? new Date(b.created).getTime() : 0
        return dateB - dateA
      })
      
      // Берем последние 5 треков от каждого артиста
      const recentSongs = sortedSongs.slice(0, 5)
      
      for (const song of recentSongs) {
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
        
        if (songs.length >= limit) break
      }
      
      if (songs.length >= limit) break
      
    } catch (error) {
      console.error(`[NewReleases] Error for ${subscription.artistName}:`, error)
    }
  }
  
  console.log(`[NewReleases] Generated ${songs.length} tracks`)
  
  return {
    songs,
    totalCount: songs.length,
    lastUpdated: Date.now(),
  }
}

/**
 * Запустить плейлист новинок
 */
export async function playNewReleases(limit: number = 25) {
  const { setSongList } = await import('@/store/player.store')
  
  const playlist = await generateNewReleasesPlaylist(limit)
  
  if (playlist.songs.length > 0) {
    setSongList(playlist.songs, 0)
    return true
  }
  
  return false
}

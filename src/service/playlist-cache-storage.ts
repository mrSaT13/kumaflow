/**
 * Playlist Cache Storage
 * 
 * Сохранение кэша использованных треков в localStorage
 * Для работы разнообразия между перезапусками приложения
 */

import type { ISong } from '@/types/responses/song'

interface CachedPlaylist {
  type: string
  songIds: string[]
  createdAt: number
}

interface CachedData {
  playlists: CachedPlaylist[]
  lastUpdated: number
}

const STORAGE_KEY = 'ml-playlist-cache'
const MAX_PLAYLISTS = 10  // Храним последние 10 плейлистов
const TTL = 7 * 24 * 60 * 60 * 1000  // 7 дней

class PlaylistCacheStorage {
  /**
   * Сохранить использованные треки
   */
  savePlaylist(type: string, songs: ISong[]) {
    const data = this.loadData()
    
    // Добавляем новый плейлист
    data.playlists.push({
      type,
      songIds: songs.map(s => s.id),
      createdAt: Date.now(),
    })
    
    // Храним только последние N плейлистов
    if (data.playlists.length > MAX_PLAYLISTS) {
      data.playlists = data.playlists.slice(-MAX_PLAYLISTS)
    }
    
    this.saveData(data)
    console.log(`[PlaylistCacheStorage] Saved ${songs.length} tracks for ${type}`)
  }

  /**
   * Получить все использованные треки из последних N плейлистов
   */
  getRecentSongIds(count: number = 5): Set<string> {
    const data = this.loadData()
    
    // Получаем последние N плейлистов
    const recent = data.playlists
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, count)
    
    const usedIds = new Set<string>()
    recent.forEach(playlist => {
      playlist.songIds.forEach(id => usedIds.add(id))
    })
    
    console.log(`[PlaylistCacheStorage] Got ${usedIds.size} recent track IDs from ${recent.length} playlists`)
    return usedIds
  }

  /**
   * Проверить есть ли трек в недавних
   */
  isRecentlyUsed(songId: string, count: number = 5): boolean {
    const recentIds = this.getRecentSongIds(count)
    return recentIds.has(songId)
  }

  /**
   * Получить кэшированный плейлист по типу
   */
  getPlaylist(type: string): CachedPlaylist | null {
    const data = this.loadData()
    const playlist = data.playlists.find(p => p.type === type)
    return playlist || null
  }

  /**
   * Очистить старые записи
   */
  cleanup() {
    const data = this.loadData()
    const now = Date.now()
    
    const before = data.playlists.length
    data.playlists = data.playlists.filter(p => now - p.createdAt < TTL)
    const removed = before - data.playlists.length
    
    if (removed > 0) {
      this.saveData(data)
      console.log(`[PlaylistCacheStorage] Cleaned up ${removed} old playlists`)
    }
  }

  /**
   * Очистить весь кэш
   */
  clear() {
    localStorage.removeItem(STORAGE_KEY)
    console.log('[PlaylistCacheStorage] Cleared all cached playlists')
  }

  /**
   * Загрузить данные из localStorage
   */
  private loadData(): CachedData {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) {
        return { playlists: [], lastUpdated: Date.now() }
      }
      return JSON.parse(data)
    } catch (error) {
      console.error('[PlaylistCacheStorage] Failed to load data:', error)
      return { playlists: [], lastUpdated: Date.now() }
    }
  }

  /**
   * Сохранить данные в localStorage
   */
  private saveData(data: CachedData) {
    try {
      data.lastUpdated = Date.now()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('[PlaylistCacheStorage] Failed to save data:', error)
    }
  }

  /**
   * Получить статистику
   */
  getStats() {
    const data = this.loadData()
    const totalTracks = data.playlists.reduce((sum, p) => sum + p.songIds.length, 0)
    
    return {
      playlists: data.playlists.length,
      totalTracks,
      lastUpdated: new Date(data.lastUpdated).toISOString(),
    }
  }
}

// Синглтон
export const playlistCacheStorage = new PlaylistCacheStorage()

// Экспорт для доступа из консоли
if (typeof window !== 'undefined') {
  ;(window as any).playlistCacheStorage = playlistCacheStorage
  console.log('[PlaylistCacheStorage] Initialized (access via window.playlistCacheStorage)')
}

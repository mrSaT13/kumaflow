/**
 * Playlist Cache - Кэширование сгенерированных плейлистов
 *
 * Особенности:
 * - Кэширование на 24 часа
 * - Исключение треков из последних 5 плейлистов
 * - Автоматическая очистка устаревших записей
 */

import type { ISong } from '@/types/responses/song'

export interface PlaylistCacheEntry {
  type: string
  songs: ISong[]
  usedSongIds: Set<string>
  createdAt: Date
  expiresAt: Date
  metadata?: {
    source?: string
    vibeSimilarity?: boolean
    orchestrated?: boolean
  }
}

export interface RecentUsedSongs {
  songIds: Set<string>
  playlistTypes: string[]
}

class PlaylistCacheService {
  private cache = new Map<string, PlaylistCacheEntry>()
  private readonly TTL = 24 * 60 * 60 * 1000 // 24 часа
  private readonly MAX_RECENT_PLAYLISTS = 5
  private readonly RECENT_TYPES = [
    'my-wave',
    'daily-mix',
    'discover-weekly',
    'ml-recommendations',
    'because-you-listened',
    'vibe-similarity',
    'mood',
    'time-of-day',
    'workout',
    'focus',
    'chill',
  ]

  /**
   * Получить кэшированный плейлист
   */
  get(type: string): ISong[] | null {
    this.cleanupExpired()
    
    const entry = this.cache.get(type)
    if (!entry || Date.now() > entry.expiresAt.getTime()) {
      this.cache.delete(type)
      return null
    }
    
    console.log(`[PlaylistCache] HIT: ${type} (${entry.songs.length} tracks)`)
    return entry.songs
  }

  /**
   * Сохранить плейлист в кэш
   */
  set(
    type: string,
    songs: ISong[],
    usedSongIds: Set<string>,
    metadata?: PlaylistCacheEntry['metadata']
  ) {
    const entry: PlaylistCacheEntry = {
      type,
      songs,
      usedSongIds,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.TTL),
      metadata,
    }
    
    this.cache.set(type, entry)
    console.log(`[PlaylistCache] SET: ${type} (${songs.length} tracks, expires in 24h)`)
  }

  /**
   * Получить использованные треки за последние N плейлистов
   */
  getRecentUsedSongIds(count: number = this.MAX_RECENT_PLAYLISTS): Set<string> {
    this.cleanupExpired()
    
    // Получаем последние N плейлистов
    const recent = Array.from(this.cache.values())
      .filter(entry => this.RECENT_TYPES.includes(entry.type))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, count)
    
    const usedIds = new Set<string>()
    recent.forEach(entry => {
      entry.usedSongIds.forEach(id => usedIds.add(id))
    })
    
    console.log(`[PlaylistCache] Recent used: ${usedIds.size} tracks from ${recent.length} playlists`)
    return usedIds
  }

  /**
   * Проверить, есть ли трек в недавних
   */
  isRecentlyUsed(songId: string, count: number = this.MAX_RECENT_PLAYLISTS): boolean {
    const recentIds = this.getRecentUsedSongIds(count)
    return recentIds.has(songId)
  }

  /**
   * Очистить устаревшие записи
   */
  private cleanupExpired() {
    const now = Date.now()
    let deleted = 0
    
    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt.getTime()) {
        this.cache.delete(key)
        deleted++
      }
    })
    
    if (deleted > 0) {
      console.log(`[PlaylistCache] Cleaned up ${deleted} expired entries`)
    }
  }

  /**
   * Очистить весь кэш
   */
  clear() {
    const count = this.cache.size
    this.cache.clear()
    console.log(`[PlaylistCache] Cleared ${count} entries`)
  }

  /**
   * Очистить конкретный тип
   */
  clearType(type: string) {
    const keysToDelete: string[] = []
    this.cache.forEach((entry, key) => {
      if (entry.type === type) {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach(key => this.cache.delete(key))
    console.log(`[PlaylistCache] Cleared ${keysToDelete.length} entries of type ${type}`)
  }

  /**
   * Получить статистику кэша
   */
  getStats() {
    this.cleanupExpired()
    
    const totalSongs = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.songs.length, 0)
    
    return {
      entries: this.cache.size,
      totalSongs,
      types: Array.from(this.cache.keys()),
      expiresAt: Array.from(this.cache.values())
        .map(e => e.expiresAt)
        .sort((a, b) => a.getTime() - b.getTime())[0]?.toISOString() || 'N/A',
    }
  }

  /**
   * Получить доступные треки (исключая недавние)
   */
  getAvailableSongs(
    allSongs: ISong[],
    excludeRecent: boolean = true,
    allowRepeatPercent: number = 0.2
  ): { available: ISong[]; canRepeat: ISong[] } {
    const recentIds = excludeRecent ? this.getRecentUsedSongIds() : new Set<string>()
    
    const available = allSongs.filter(song => !recentIds.has(song.id))
    const canRepeat = allSongs.filter(song => recentIds.has(song.id))
    
    // Разрешаем повторения если мало доступных
    const minAvailable = Math.floor(allSongs.length * allowRepeatPercent)
    if (available.length < minAvailable && canRepeat.length > 0) {
      console.log(`[PlaylistCache] Low availability (${available.length}), allowing repeats`)
    }
    
    return { available, canRepeat }
  }
}

// Синглтон
export const playlistCache = new PlaylistCacheService()

// Экспорт для доступа из консоли
if (typeof window !== 'undefined') {
  ;(window as any).playlistCache = playlistCache
  console.log('[PlaylistCache] Initialized (access via window.playlistCache)')
}

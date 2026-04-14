/**
 * Cache Service - Кеширование данных (артисты, треки, обложки)
 * 
 * Особенности:
 * - Сохранение в localStorage
 * - Ограничение по размеру
 * - Автоматическая очистка старых записей
 * - TTL (время жизни кеша)
 */

import type { ISong } from '@/types/responses/song'
import type { IArtist } from '@/types/responses/artist'
import { subsonic } from '@/service/subsonic'

export interface CacheEntry<T> {
  data: T
  cachedAt: number
  expiresAt: number
}

export interface CacheStats {
  totalItems: number
  totalSize: number  // в байтах
  artists: number
  tracks: number
  images: number
  lastCleanup: number
}

export interface CacheSettings {
  maxTracks: number
  maxArtists: number
  maxCacheSizeMB: number
  ttlHours: number
}

const DEFAULT_SETTINGS: CacheSettings = {
  maxTracks: 1000,
  maxArtists: 500,
  maxCacheSizeMB: 100,
  ttlHours: 168, // 7 дней
}

const STORAGE_KEYS = {
  tracks: 'cache-tracks',
  artists: 'cache-artists',
  images: 'cache-images',
  settings: 'cache-settings',
  stats: 'cache-stats',
}

class CacheService {
  private settings: CacheSettings = DEFAULT_SETTINGS

  constructor() {
    this.loadSettings()
  }

  // ============================================
  // НАСТРОЙКИ
  // ============================================

  private loadSettings() {
    try {
      const settingsStr = localStorage.getItem(STORAGE_KEYS.settings)
      if (settingsStr) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(settingsStr) }
      }
    } catch (error) {
      console.error('[CacheService] Failed to load settings:', error)
    }
  }

  updateSettings(newSettings: Partial<CacheSettings>) {
    this.settings = { ...this.settings, ...newSettings }
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(this.settings))
    console.log('[CacheService] Settings updated:', this.settings)
    
    // Применяем новые настройки (очистка если нужно)
    this.cleanup()
  }

  getSettings(): CacheSettings {
    return { ...this.settings }
  }

  // ============================================
  // ТРЕКИ
  // ============================================

  async cacheTracks(trackIds: string[]): Promise<number> {
    console.log(`[CacheService] Caching ${trackIds.length} tracks...`)

    // Отправляем событие начала кеширования
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cache-start', {
        detail: { total: trackIds.length },
      }))
    }

    let cachedCount = 0

    for (let i = 0; i < trackIds.length; i++) {
      const trackId = trackIds[i]
      try {
        // Проверяем есть ли уже в кеше
        const existing = this.getCachedTrack(trackId)
        if (existing) {
          console.log(`[CacheService] Track ${trackId} already cached`)
          continue
        }

        // Получаем трек с сервера
        const track = await subsonic.songs.getSong(trackId)
        if (!track) {
          console.warn(`[CacheService] Failed to get track ${trackId}`)
          continue
        }

        // Сохраняем метаданные в кеш
        this.setCacheEntry(STORAGE_KEYS.tracks, trackId, track)
        cachedCount++

        // Кешируем аудиофайл через Cache API
        if (track.id) {
          const success = await this.cacheAudioFile(track.id)
          if (success) {
            cachedCount++
          }
        }

        // Отправляем событие прогресса
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cache-progress', {
            detail: { current: i + 1, total: trackIds.length, trackId },
          }))
        }

      } catch (error) {
        console.error(`[CacheService] Failed to cache track ${trackId}:`, error)
      }
    }

    console.log(`[CacheService] Cached ${cachedCount}/${trackIds.length} tracks`)

    // Отправляем событие завершения
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cache-complete', {
        detail: { cached: cachedCount, total: trackIds.length },
      }))
    }

    // Проверяем лимиты
    this.enforceLimits()

    return cachedCount
  }

  /**
   * Кеширование аудиофайла через Cache API
   */
  async cacheAudioFile(trackId: string): Promise<boolean> {
    try {
      // Проверяем поддержку Cache API
      if (!('caches' in window)) {
        console.error('[CacheService] Cache API not supported!')
        return false
      }

      console.log(`[CacheService] Opening cache for ${trackId}...`)
      const cache = await caches.open('kumaflow-audio')
      console.log(`[CacheService] Cache opened:`, cache)

      // Получаем URL для стриминга
      const streamUrl = subsonic.songs.getStreamUrl(trackId)
      console.log(`[CacheService] Caching audio for ${trackId} from ${streamUrl}`)

      // Скачиваем файл как blob
      console.log(`[CacheService] Fetching audio...`)
      const response = await fetch(streamUrl)
      console.log(`[CacheService] Fetch response:`, {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`)
      }

      // Получаем blob и создаем новый response с правильными заголовками
      const blob = await response.blob()
      console.log(`[CacheService] Blob size:`, (blob.size / 1024 / 1024).toFixed(2), 'MB')
      
      const contentType = response.headers.get('content-type') || 'audio/mpeg'

      // Создаем новый response для кеша
      const cacheResponse = new Response(blob, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': blob.size.toString(),
        },
      })

      // Сохраняем в кеш - используем URL как ключ!
      console.log(`[CacheService] Saving to cache with URL key...`)
      await cache.put(streamUrl, cacheResponse)
      console.log(`[CacheService] Cached audio file ${trackId} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`)

      // Сохраняем метаданные трека в localStorage для отображения в UI
      try {
        const songInfo = await subsonic.songs.getSong(trackId)
        if (songInfo) {
          this.setCacheEntry(STORAGE_KEYS.tracks, trackId, songInfo)
          console.log(`[CacheService] Saved metadata for ${trackId}`)
        }
      } catch (metaError) {
        console.warn(`[CacheService] Failed to save metadata for ${trackId}:`, metaError)
      }

      // Отправляем событие обновления кэша
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cache-updated', {
          detail: { type: 'song', trackId, size: blob.size },
        }))
      }

      return true

    } catch (error) {
      console.error(`[CacheService] Failed to cache audio ${trackId}:`, error)
      return false
    }
  }

  /**
   * Получить закешированный аудиофайл
   */
  async getCachedAudioUrl(trackId: string): Promise<string | null> {
    try {
      const cache = await caches.open('kumaflow-audio')
      
      // Получаем URL для поиска в кэше
      const streamUrl = subsonic.songs.getStreamUrl(trackId)
      const cachedResponse = await cache.match(streamUrl)

      if (!cachedResponse) {
        console.log(`[CacheService] No cached audio for ${trackId}`)
        return null
      }

      // Создаем blob URL из закешированного response
      const blob = await cachedResponse.blob()
      const url = URL.createObjectURL(blob)
      console.log(`[CacheService] Got cached audio URL for ${trackId}`)
      return url

    } catch (error) {
      console.error(`[CacheService] Failed to get cached audio ${trackId}:`, error)
      return null
    }
  }

  /**
   * Проверка наличия аудио в кеше
   */
  async isAudioCached(trackId: string): Promise<boolean> {
    try {
      const cache = await caches.open('kumaflow-audio')
      const cachedResponse = await cache.match(trackId)
      return !!cachedResponse
    } catch {
      return false
    }
  }

  /**
   * Удалить закешированный аудиофайл
   */
  async removeCachedAudio(trackId: string): Promise<boolean> {
    try {
      const cache = await caches.open('kumaflow-audio')
      return await cache.delete(trackId)
    } catch (error) {
      console.error(`[CacheService] Failed to remove cached audio ${trackId}:`, error)
      return false
    }
  }

  getCachedTrack(trackId: string): ISong | null {
    return this.getCacheEntry<ISong>(STORAGE_KEYS.tracks, trackId)
  }

  getCachedTracks(): ISong[] {
    return this.getAllCacheEntries<ISong>(STORAGE_KEYS.tracks)
  }

  removeCachedTrack(trackId: string): boolean {
    return this.removeCacheEntry(STORAGE_KEYS.tracks, trackId)
  }

  // ============================================
  // АРТИСТЫ
  // ============================================

  async cacheArtists(artistIds: string[]): Promise<number> {
    console.log(`[CacheService] Caching ${artistIds.length} artists...`)

    let cachedCount = 0
    let tracksCachedCount = 0

    for (const artistId of artistIds) {
      try {
        // Проверяем есть ли уже в кеше
        const existing = this.getCachedArtist(artistId)
        if (existing) {
          console.log(`[CacheService] Artist ${artistId} already cached`)
          continue
        }

        // Получаем артиста с сервера
        const artist = await subsonic.artists.getOne(artistId)
        if (!artist) {
          console.warn(`[CacheService] Failed to get artist ${artistId}`)
          continue
        }

        // Сохраняем метаданные артиста в кеш
        this.setCacheEntry(STORAGE_KEYS.artists, artistId, artist)
        cachedCount++

        // Кешируем все треки артиста через запрос каждого альбома
        if (artist.album && artist.album.length > 0) {
          console.log(`[CacheService] Caching ${artist.album.length} albums for artist ${artist.name}`)
          
          const trackIds: string[] = []
          
          // Запрашиваем каждый альбом отдельно для получения треков
          for (const album of artist.album) {
            try {
              const albumDetails = await subsonic.albums.getOne(album.id)
              if (albumDetails && albumDetails.song) {
                albumDetails.song.forEach(song => {
                  if (song.id) {
                    trackIds.push(song.id)
                  }
                })
              }
            } catch (error) {
              console.error(`[CacheService] Failed to get album ${album.id}:`, error)
            }
          }

          if (trackIds.length > 0) {
            console.log(`[CacheService] Caching ${trackIds.length} tracks for artist ${artist.name}`)
            const cachedTracks = await this.cacheTracks(trackIds)
            tracksCachedCount += cachedTracks
          }
        }

      } catch (error) {
        console.error(`[CacheService] Failed to cache artist ${artistId}:`, error)
      }
    }

    console.log(`[CacheService] Cached ${cachedCount} artists, ${tracksCachedCount} tracks`)

    // Проверяем лимиты
    this.enforceLimits()

    return cachedCount
  }

  getCachedArtist(artistId: string): IArtist | null {
    return this.getCacheEntry<IArtist>(STORAGE_KEYS.artists, artistId)
  }

  getCachedArtists(): IArtist[] {
    return this.getAllCacheEntries<IArtist>(STORAGE_KEYS.artists)
  }

  removeCachedArtist(artistId: string): boolean {
    return this.removeCacheEntry(STORAGE_KEYS.artists, artistId)
  }

  // ============================================
  // ОБЛОЖКИ (Service Worker Cache API)
  // ============================================

  async cacheImageUrl(url: string, id: string): Promise<boolean> {
    try {
      const cache = await caches.open('kumaflow-images')
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`)
      }

      const blob = await response.blob()
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      
      const cacheResponse = new Response(blob, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': blob.size.toString(),
        },
      })
      
      await cache.put(id, cacheResponse)
      console.log(`[CacheService] Cached image ${id} (${(blob.size / 1024).toFixed(2)} KB)`)
      return true

    } catch (error) {
      console.error(`[CacheService] Failed to cache image ${id}:`, error)
      return false
    }
  }

  /**
   * Кеширование обложки артиста
   */
  async cacheArtistCover(artistId: string, coverArtId: string): Promise<boolean> {
    try {
      const url = subsonic.covers.getCoverArtUrl(coverArtId, 'artist', 700)
      if (!url) return false
      
      return await this.cacheImageUrl(url, `artist-${artistId}`)
    } catch (error) {
      console.error(`[CacheService] Failed to cache artist cover ${artistId}:`, error)
      return false
    }
  }

  /**
   * Кеширование обложки альбома
   */
  async cacheAlbumCover(albumId: string, coverArtId: string): Promise<boolean> {
    try {
      const url = subsonic.covers.getCoverArtUrl(coverArtId, 'album', 700)
      if (!url) return false
      
      return await this.cacheImageUrl(url, `album-${albumId}`)
    } catch (error) {
      console.error(`[CacheService] Failed to cache album cover ${albumId}:`, error)
      return false
    }
  }

  async getCachedImageUrl(id: string): Promise<string | null> {
    try {
      const cache = await caches.open('kumaflow-images')
      const cachedResponse = await cache.match(id)
      
      if (!cachedResponse) {
        return null
      }

      const blob = await cachedResponse.blob()
      return URL.createObjectURL(blob)
      
    } catch (error) {
      console.error(`[CacheService] Failed to get cached image ${id}:`, error)
      return null
    }
  }

  async removeCachedImage(id: string): Promise<boolean> {
    try {
      const cache = await caches.open('kumaflow-images')
      return await cache.delete(id)
    } catch (error) {
      console.error(`[CacheService] Failed to remove cached image ${id}:`, error)
      return false
    }
  }

  // ============================================
  // УПРАВЛЕНИЕ КЕШЕМ
  // ============================================

  clearCache(): { tracks: number; artists: number; images: number } {
    const tracks = this.clearCacheType(STORAGE_KEYS.tracks)
    const artists = this.clearCacheType(STORAGE_KEYS.artists)
    
    // Очищаем Service Worker cache
    caches.keys().then(names => {
      names.forEach(name => {
        if (name.startsWith('kumaflow-')) {
          caches.delete(name)
        }
      })
    })

    console.log(`[CacheService] Cleared cache: ${tracks} tracks, ${artists} artists`)
    
    return { tracks, artists, images: 0 }
  }

  async getStats(): Promise<CacheStats> {
    const tracks = this.getAllCacheEntries<ISong>(STORAGE_KEYS.tracks)
    const artists = this.getAllCacheEntries<IArtist>(STORAGE_KEYS.artists)

    // Приблизительный размер метаданных в байтах
    const tracksSize = JSON.stringify(tracks).length * 2
    const artistsSize = JSON.stringify(artists).length * 2

    // Размер аудиофайлов в Cache API
    let audioSize = 0
    try {
      const cache = await caches.open('kumaflow-audio')
      const keys = await cache.keys()
      for (const request of keys) {
        const response = await cache.match(request)
        if (response) {
          const contentLength = response.headers.get('Content-Length')
          if (contentLength) {
            audioSize += parseInt(contentLength, 10)
          }
        }
      }
    } catch (error) {
      console.error('[CacheService] Failed to get audio cache size:', error)
    }

    // Размер изображений в Cache API
    let imageSize = 0
    try {
      const cache = await caches.open('kumaflow-images')
      const keys = await cache.keys()
      for (const request of keys) {
        const response = await cache.match(request)
        if (response) {
          const contentLength = response.headers.get('Content-Length')
          if (contentLength) {
            imageSize += parseInt(contentLength, 10)
          }
        }
      }
    } catch (error) {
      console.error('[CacheService] Failed to get image cache size:', error)
    }

    return {
      totalItems: tracks.length + artists.length,
      totalSize: tracksSize + artistsSize + audioSize + imageSize,
      artists: artists.length,
      tracks: tracks.length,
      images: 0,
      lastCleanup: Date.now(),
    }
  }

  // ============================================
  // ВНУТРЕННИЕ МЕТОДЫ
  // ============================================

  private setCacheEntry<T>(storageKey: string, id: string, data: T) {
    try {
      const cache = this.getCacheFromStorage(storageKey)

      // 🆕 Ограничиваем размер кэша - максимум maxTracks записей
      const entries = Object.keys(cache)
      if (storageKey === STORAGE_KEYS.tracks && entries.length >= this.settings.maxTracks) {
        // Удаляем oldest entry
        const oldest = entries.sort((a, b) => cache[a].cachedAt - cache[b].cachedAt)[0]
        delete cache[oldest]
        console.log(`[CacheService] Removed oldest cache entry: ${oldest}`)
      }

      cache[id] = {
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (this.settings.ttlHours * 60 * 60 * 1000),
      }

      localStorage.setItem(storageKey, JSON.stringify(cache))

    } catch (error) {
      console.error(`[CacheService] Failed to set cache entry ${id}:`, error)

      // 🆕 Если память переполнена - очищаем ВЕСЬ кеш этого типа
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('[CacheService] Storage quota exceeded, clearing this cache...')
        try {
          localStorage.removeItem(storageKey)
          console.log(`[CacheService] Cleared ${storageKey} cache to free space`)
          // Пробуем сохранить ещё раз после очистки
          const freshCache: Record<string, CacheEntry<T>> = {}
          freshCache[id] = {
            data,
            cachedAt: Date.now(),
            expiresAt: Date.now() + (this.settings.ttlHours * 60 * 60 * 1000),
          }
          localStorage.setItem(storageKey, JSON.stringify(freshCache))
        } catch (e) {
          console.error('[CacheService] Failed to save even after clearing cache:', e)
        }
      }
    }
  }

  private getCacheEntry<T>(storageKey: string, id: string): T | null {
    try {
      const cache = this.getCacheFromStorage(storageKey)
      const entry = cache[id]
      
      if (!entry) {
        return null
      }
      
      // Проверяем не истёк ли TTL
      if (Date.now() > entry.expiresAt) {
        this.removeCacheEntry(storageKey, id)
        return null
      }
      
      return entry.data as T
      
    } catch (error) {
      console.error(`[CacheService] Failed to get cache entry ${id}:`, error)
      return null
    }
  }

  private getAllCacheEntries<T>(storageKey: string): T[] {
    try {
      const cache = this.getCacheFromStorage(storageKey)
      const entries: T[] = []
      
      Object.entries(cache).forEach(([id, entry]) => {
        // Проверяем не истёк ли TTL
        if (Date.now() <= entry.expiresAt) {
          entries.push(entry.data as T)
        } else {
          // Удаляем истёкшие
          this.removeCacheEntry(storageKey, id)
        }
      })
      
      return entries
      
    } catch (error) {
      console.error(`[CacheService] Failed to get all cache entries:`, error)
      return []
    }
  }

  private removeCacheEntry(storageKey: string, id: string): boolean {
    try {
      const cache = this.getCacheFromStorage(storageKey)
      delete cache[id]
      localStorage.setItem(storageKey, JSON.stringify(cache))
      return true
      
    } catch (error) {
      console.error(`[CacheService] Failed to remove cache entry ${id}:`, error)
      return false
    }
  }

  private getCacheFromStorage(storageKey: string): Record<string, CacheEntry<any>> {
    try {
      const data = localStorage.getItem(storageKey)
      if (!data) {
        return {}
      }
      return JSON.parse(data)
    } catch (error) {
      console.error(`[CacheService] Failed to parse cache from storage:`, error)
      return {}
    }
  }

  private clearCacheType(storageKey: string): number {
    try {
      const cache = this.getCacheFromStorage(storageKey)
      const count = Object.keys(cache).length
      localStorage.removeItem(storageKey)
      return count
    } catch (error) {
      console.error(`[CacheService] Failed to clear cache type:`, error)
      return 0
    }
  }

  private enforceLimits() {
    // Проверяем лимит по количеству треков
    const tracks = this.getAllCacheEntries<ISong>(STORAGE_KEYS.tracks)
    if (tracks.length > this.settings.maxTracks) {
      // Удаляем самые старые
      const toRemove = tracks.length - this.settings.maxTracks
      console.log(`[CacheService] Removing ${toRemove} oldest tracks to enforce limit`)
      
      const sorted = tracks.sort((a, b) => {
        const cacheA = this.getCacheFromStorage(STORAGE_KEYS.tracks)[a.id]
        const cacheB = this.getCacheFromStorage(STORAGE_KEYS.tracks)[b.id]
        return cacheA.cachedAt - cacheB.cachedAt
      })
      
      sorted.slice(0, toRemove).forEach(track => {
        this.removeCachedTrack(track.id)
      })
    }

    // Проверяем лимит по количеству артистов
    const artists = this.getAllCacheEntries<IArtist>(STORAGE_KEYS.artists)
    if (artists.length > this.settings.maxArtists) {
      const toRemove = artists.length - this.settings.maxArtists
      console.log(`[CacheService] Removing ${toRemove} oldest artists to enforce limit`)
      
      const sorted = artists.sort((a, b) => {
        const cacheA = this.getCacheFromStorage(STORAGE_KEYS.artists)[a.id]
        const cacheB = this.getCacheFromStorage(STORAGE_KEYS.artists)[b.id]
        return cacheA.cachedAt - cacheB.cachedAt
      })
      
      sorted.slice(0, toRemove).forEach(artist => {
        this.removeCachedArtist(artist.id)
      })
    }

    // Проверяем лимит по размеру
    const stats = this.getStats()
    const maxSizeBytes = this.settings.maxCacheSizeMB * 1024 * 1024
    
    if (stats.totalSize > maxSizeBytes) {
      console.log(`[CacheService] Cache size ${stats.totalSize} exceeds limit ${maxSizeBytes}, cleaning up`)
      this.cleanup()
    }
  }

  private cleanup() {
    const now = Date.now()
    let cleaned = 0

    // Очищаем истёкшие треки
    const tracksCache = this.getCacheFromStorage(STORAGE_KEYS.tracks)
    Object.entries(tracksCache).forEach(([id, entry]) => {
      if (now > entry.expiresAt) {
        this.removeCachedTrack(id)
        cleaned++
      }
    })

    // Очищаем истёкших артистов
    const artistsCache = this.getCacheFromStorage(STORAGE_KEYS.artists)
    Object.entries(artistsCache).forEach(([id, entry]) => {
      if (now > entry.expiresAt) {
        this.removeCachedArtist(id)
        cleaned++
      }
    })

    // 🆕 Если кэш всё ещё большой - удаляем oldest записи
    this.enforceSizeLimit()

    console.log(`[CacheService] Cleaned up ${cleaned} expired entries`)
  }

  // 🆕 Принудительно ограничиваем размер кэша
  private enforceSizeLimit() {
    try {
      // Треки
      let tracksCache = this.getCacheFromStorage(STORAGE_KEYS.tracks)
      const trackKeys = Object.keys(tracksCache)
      if (trackKeys.length > this.settings.maxTracks) {
        // Сортируем по cachedAt (oldest first)
        const sorted = trackKeys.sort((a, b) => tracksCache[a].cachedAt - tracksCache[b].cachedAt)
        const toRemove = sorted.slice(0, sorted.length - this.settings.maxTracks)
        toRemove.forEach(id => this.removeCachedTrack(id))
        console.log(`[CacheService] Removed ${toRemove.length} oldest tracks to enforce limit`)
      }

      // Артисты
      let artistsCache = this.getCacheFromStorage(STORAGE_KEYS.artists)
      const artistKeys = Object.keys(artistsCache)
      if (artistKeys.length > this.settings.maxArtists) {
        const sorted = artistKeys.sort((a, b) => artistsCache[a].cachedAt - artistsCache[b].cachedAt)
        const toRemove = sorted.slice(0, sorted.length - this.settings.maxArtists)
        toRemove.forEach(id => this.removeCachedArtist(id))
        console.log(`[CacheService] Removed ${toRemove.length} oldest artists to enforce limit`)
      }
    } catch (error) {
      console.error('[CacheService] Error enforcing size limit:', error)
    }
  }
}

// Синглтон
export const cacheService = new CacheService()

// Экспорт для доступа из консоли
if (typeof window !== 'undefined') {
  ;(window as any).cacheService = cacheService
  console.log('[CacheService] Initialized (access via window.cacheService)')
}

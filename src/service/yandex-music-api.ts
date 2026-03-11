/**
 * Yandex Music API
 * 
 * Интеграция с Яндекс.Музыкой для:
 * - Поиска треков/артистов/альбомов
 * - Получения обложек
 * - Жанров и рекомендаций
 * 
 * Авторизация: x_token (OAuth 2.0)
 * API: https://api.music.yandex.net
 */

export interface YandexTrack {
  id: number
  title: string
  artists: Array<{ name: string; id: number }>
  albums: Array<{ title: string; id: number; coverUri?: string }>
  durationMs: number
  coverUri?: string
  genres?: string[]
}

export interface YandexArtist {
  id: number
  name: string
  cover: { uri: string }
  genres: string[]
}

export interface YandexAlbum {
  id: number
  title: string
  artists: Array<{ name: string; id: number }>
  coverUri?: string
  year: number
  trackCount: number
}

export interface YandexTrackInfo {
  id: number
  title: string
  artists: Array<{ name: string; id: number }>
  albums: Array<{ title: string; id: number }>
  durationMs: number
  bpm?: number
  energy?: number
  mood?: string
  genres?: string[]
}

export interface YandexArtistInfo {
  id: number
  name: string
  cover: { uri: string }
  genres: string[]
  description?: string
  counts?: {
    tracks?: number
    albums?: number
  }
}

export interface YandexLikedTracks {
  library: {
    tracks: Array<{
      id: number
      timestamp: number
    }>
  }
}

class YandexMusicService {
  private baseUrl: string = 'https://api.music.yandex.net'
  private token: string = ''
  private cache: Map<string, { data: any; expires: number }> = new Map()
  private readonly CACHE_TTL: number = 24 * 60 * 60 * 1000 // 24 часа
  private readonly RATE_LIMIT_DELAY: number = 200 // 5 запросов/сек

  /**
   * Инициализация сервиса с токеном
   */
  initialize(token: string): void {
    this.token = token
    console.log('[YandexMusic] Service initialized')
  }

  /**
   * Проверка инициализации
   */
  isInitialized(): boolean {
    return !!this.token
  }

  /**
   * Rate limiting
   */
  private async rateLimit(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY))
  }

  /**
   * GET запрос к Yandex Music API (через Electron для обхода CORS)
   */
  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    if (!this.token) {
      console.warn('[YandexMusic] Not initialized')
      return null
    }

    // Проверка кэша
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`
    const cached = this.cache.get(cacheKey)

    if (cached && cached.expires > Date.now()) {
      console.log(`[YandexMusic] Cache hit: ${endpoint}`)
      return cached.data as T
    }

    await this.rateLimit()

    try {
      // Используем Electron IPC для обхода CORS
      const result = await (window as any).api?.yandexMusicApi?.({
        endpoint,
        token: this.token,
        params,
      })
      
      if (!result) {
        console.error('[YandexMusic] Empty response')
        return null
      }
      
      if (result.error) {
        console.error(`[YandexMusic] API error: ${result.error}`)
        return null
      }

      // Кэширование успешного ответа
      this.cache.set(cacheKey, {
        data: result,
        expires: Date.now() + this.CACHE_TTL,
      })

      return result as T
    } catch (error) {
      console.error(`[YandexMusic] Request failed: ${endpoint}`, error)
      return null
    }
  }

  /**
   * Поиск треков
   */
  async searchTracks(query: string, limit: number = 20): Promise<YandexTrack[]> {
    const response = await this.request<any>('/search', {
      text: query,
      type: 'track',
      page: '0',
      nocorrect: 'true',
    })

    if (!response?.result?.tracks) {
      return []
    }

    return response.result.tracks.results.slice(0, limit).map((track: any) => ({
      id: track.id,
      title: track.title,
      artists: track.artists?.map((a: any) => ({ name: a.name, id: a.id })) || [],
      albums: track.albums?.map((a: any) => ({ title: a.title, id: a.id, coverUri: a.coverUri })) || [],
      durationMs: track.durationMs,
      coverUri: track.albums?.[0]?.coverUri,
      genres: track.meta_data?.genre?.value ? [track.meta_data.genre.value] : [],
    }))
  }

  /**
   * Поиск артистов
   */
  async searchArtists(query: string, limit: number = 10): Promise<YandexArtist[]> {
    const response = await this.request<any>('/search', {
      text: query,
      type: 'artist',
      page: '0',
    })

    if (!response?.result?.artists?.results) {
      return []
    }

    return response.result.artists.results.slice(0, limit).map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      cover: artist.cover,
      genres: artist.genres || [],
    }))
  }

  /**
   * Поиск альбомов
   */
  async searchAlbums(query: string, limit: number = 10): Promise<YandexAlbum[]> {
    const response = await this.request<any>('/search', {
      text: query,
      type: 'album',
      page: '0',
    })

    if (!response?.result?.albums) {
      return []
    }

    return response.result.albums.results.slice(0, limit).map((album: any) => ({
      id: album.id,
      title: album.title,
      artists: album.artists?.map((a: any) => ({ name: a.name, id: a.id })) || [],
      coverUri: album.coverUri,
      year: album.year,
      trackCount: album.trackCount,
    }))
  }

  /**
   * Получить информацию об артисте (жанры, описание)
   */
  async getArtistInfo(artistId: number): Promise<YandexArtistInfo | null> {
    const response = await this.request<any>(`/artists/${artistId}`, {})

    if (!response?.artist) {
      return null
    }

    const artist = response.artist
    return {
      id: artist.id,
      name: artist.name,
      cover: artist.cover,
      genres: artist.genres || [],
      description: artist.description?.text,
      counts: artist.counts,
    }
  }

  /**
   * Получить информацию о треке (BPM, энергия, настроение)
   */
  async getTrackInfo(trackId: number): Promise<YandexTrackInfo | null> {
    const response = await this.request<any>(`/tracks/${trackId}`, {})

    if (!response?.track) {
      return null
    }

    const track = response.track
    const meta = track.meta_data || {}
    
    return {
      id: track.id,
      title: track.title,
      artists: track.artists?.map((a: any) => ({ name: a.name, id: a.id })) || [],
      albums: track.albums?.map((a: any) => ({ title: a.title, id: a.id })) || [],
      durationMs: track.durationMs,
      bpm: meta.tempo?.bpm,
      energy: meta.energy,
      mood: meta.mood,
      genres: meta.genre?.value ? [meta.genre.value] : [],
    }
  }

  /**
   * Получить лайкнутые треки пользователя
   */
  async getLikedTracks(): Promise<number[]> {
    const response = await this.request<any>('/users/likes/tracks', {})

    if (!response?.library?.tracks) {
      return []
    }

    return response.library.tracks.map((t: any) => t.id)
  }

  /**
   * Получить лайкнутых артистов пользователя
   */
  async getLikedArtists(): Promise<number[]> {
    const response = await this.request<any>('/users/likes/artists', {})

    if (!response?.library?.artists) {
      return []
    }

    return response.library.artists.map((a: any) => a.id)
  }

  /**
   * Получить жанры артиста
   */
  async getArtistGenres(artistId: number): Promise<string[]> {
    const info = await this.getArtistInfo(artistId)
    return info?.genres || []
  }

  /**
   * Получить похожих артистов
   */
  async getSimilarArtists(artistId: number, limit: number = 10): Promise<YandexArtist[]> {
    const response = await this.request<any>(`/artists/${artistId}/similar`, {
      page: '0',
    })

    if (!response?.artists) {
      return []
    }

    return response.artists.slice(0, limit).map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      cover: artist.cover,
      genres: artist.genres || [],
    }))
  }

  /**
   * Получить обложку артиста в высоком качестве
   */
  getArtistImageUrl(artistId: number, size: number = 1000): string | null {
    // Формат: https://avatars.yandex.net/get-music-artist/.../{size}x{size}
    return `https://avatars.yandex.net/get-music-artist/${artistId}/${size}x${size}`
  }

  /**
   * Получить обложку альбома в высоком качестве
   */
  getAlbumImageUrl(coverUri: string, size: number = 1000): string {
    // Формат: https://avatars.yandex.net/get-music-content/.../{size}x{size}
    return `https://avatars.yandex.net/get-music-content/${coverUri}/${size}x${size}`
  }

  /**
   * Очистка кэша
   */
  clearCache(): void {
    this.cache.clear()
    console.log('[YandexMusic] Cache cleared')
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats(): { size: number } {
    const now = Date.now()
    const validEntries = Array.from(this.cache.entries()).filter(
      ([, entry]) => entry.expires > now
    )

    return {
      size: validEntries.length,
    }
  }
}

// Синглтон
export const yandexMusicService = new YandexMusicService()

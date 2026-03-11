/**
 * Fanart.tv API Client
 * 
 * Интеграция с Fanart.tv для получения HD изображений:
 * - Artist backgrounds (1920x1080)
 * - Artist logos (прозрачные)
 * - Artist thumbnails
 * - Album covers
 * 
 * API Key: https://fanart.tv/get-an-api-key/
 * Rate Limit: 2 запроса/сек (free tier)
 * 
 * Требует MBID (MusicBrainz ID) артиста/альбома
 */

interface FanartImage {
  id: string
  url: string
  lang: string
  likes: string
  discord: string
  user: string
  width: string  // v3.2
  height: string  // v3.2
}

interface FanartArtistResponse {
  name: string
  musicbrainz_id: string
  hdmusiclogo?: FanartImage[]
  musiclogo?: FanartImage[]
  hdmusicbackground?: FanartImage[]
  musicbackground?: FanartImage[]
  musicthumb?: FanartImage[]
}

interface FanartAlbumResponse {
  name: string
  musicbrainz_id: string
  albumcover?: FanartImage[]
  cdart?: FanartImage[]
}

export interface FanartArtistImages {
  name: string
  mbid: string
  logos: FanartImageItem[] // HD логотипы с размерами
  backgrounds: FanartImageItem[] // Фоны 1920x1080 с размерами
  thumbnails: FanartImageItem[] // Миниатюры с размерами
}

export interface FanartImageItem {
  id: string
  url: string
  lang: string
  likes: number
  width: number
  height: number
  user: string
}

export interface FanartAlbumImages {
  name: string
  mbid: string
  covers: string[] // Обложки альбомов
  cdarts: string[] // CD арты
}

class FanartService {
  private apiKey: string = ''
  private clientKey: string = '' // Personal API key (опционально)
  private baseUrl: string = 'https://webservice.fanart.tv/v3.2'  // v3.2 с размерами!
  private cache: Map<string, { data: any; expires: number }> = new Map()
  private readonly CACHE_TTL: number = 7 * 24 * 60 * 60 * 1000 // 7 дней
  private readonly RATE_LIMIT_DELAY: number = 500 // 2 запроса/сек
  private lastRequestTime: number = 0

  /**
   * Инициализация сервиса с API ключом
   */
  initialize(apiKey: string, clientKey?: string): void {
    this.apiKey = apiKey
    this.clientKey = clientKey || ''
    console.log('[Fanart.tv] Service initialized (v3.2)', {
      hasApiKey: !!apiKey,
      hasClientKey: !!clientKey,
    })
  }

  /**
   * Проверка инициализации
   */
  isInitialized(): boolean {
    return !!this.apiKey
  }

  /**
   * Rate limiting
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    
    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      await new Promise(resolve => 
        setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSinceLastRequest)
      )
    }
    
    this.lastRequestTime = Date.now()
  }

  /**
   * GET запрос к Fanart.tv API
   */
  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    if (!this.apiKey) {
      console.warn('[Fanart.tv] API key not set')
      return null
    }

    // Проверка кэша
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`
    const cached = this.cache.get(cacheKey)

    if (cached && cached.expires > Date.now()) {
      console.log(`[Fanart.tv] Cache hit: ${endpoint}`)
      return cached.data as T
    }

    await this.rateLimit()

    try {
      const url = new URL(`${this.baseUrl}${endpoint}`)
      url.searchParams.set('api_key', this.apiKey)
      
      // Добавляем personal key если есть (для лучшего доступа)
      if (this.clientKey) {
        url.searchParams.set('client_key', this.clientKey)
        console.log('[Fanart.tv] Using personal client key')
      }

      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })

      // Используем Electron IPC для обхода CORS
      if (window?.api?.fetchExternal) {
        console.log('[Fanart.tv] Using Electron fetch proxy')
        const data = await window.api.fetchExternal(url.toString())

        // Проверяем, не raw ли это ответ
        if (data._isRaw) {
          console.warn('[Fanart.tv] Got raw response, trying to parse...')
          try {
            const json = JSON.parse(data._raw)
            // Кэширование успешного ответа
            this.cache.set(cacheKey, {
              data: json,
              expires: Date.now() + this.CACHE_TTL,
            })
            return json as T
          } catch (e) {
            console.error('[Fanart.tv] Failed to parse raw response:', e)
            return null
          }
        } else {
          // Кэширование успешного ответа
          this.cache.set(cacheKey, {
            data,
            expires: Date.now() + this.CACHE_TTL,
          })
          return data as T
        }
      } else {
        // Fallback для браузера
        const response = await fetch(url.toString())

        if (!response.ok) {
          if (response.status === 429) {
            console.warn('[Fanart.tv] Rate limit exceeded, waiting...')
            await new Promise(resolve => setTimeout(resolve, 2000))
            return this.request<T>(endpoint, params)
          }

          if (response.status === 404) {
            console.log(`[Fanart.tv] No images found: ${endpoint}`)
            return null
          }

          console.error(`[Fanart.tv] HTTP error ${response.status}: ${endpoint}`)
          return null
        }

        const data = await response.json()

        // Кэширование успешного ответа
        this.cache.set(cacheKey, {
          data,
          expires: Date.now() + this.CACHE_TTL,
        })

        return data as T
      }
    } catch (error) {
      console.error(`[Fanart.tv] Request failed: ${endpoint}`, error)
      return null
    }
  }

  /**
   * Получить изображения артиста по MBID
   * 
   * @param mbid - MusicBrainz ID артиста
   */
  async getArtistImages(mbid: string): Promise<FanartArtistImages | null> {
    if (!mbid) {
      console.warn('[Fanart.tv] MBID is required')
      return null
    }

    const response = await this.request<FanartArtistResponse>(`/music/${mbid}`)

    if (!response) {
      return null
    }

    return {
      name: response.name,
      mbid: response.musicbrainz_id,
      logos: this.extractImages(response.hdmusiclogo || response.musiclogo || []),
      backgrounds: this.extractImages(response.hdmusicbackground || response.musicbackground || []),
      thumbnails: this.extractImages(response.musicthumb || []),
    }
  }

  /**
   * Извлечь изображения с размерами (v3.2)
   */
  private extractImages(images: FanartImage[]): FanartImageItem[] {
    return images
      .filter(img => img.url)
      .map(img => ({
        id: img.id,
        url: img.url,
        lang: img.lang || 'en',
        likes: parseInt(img.likes, 10) || 0,
        width: parseInt(img.width, 10) || 0,
        height: parseInt(img.height, 10) || 0,
        user: img.user || 'unknown',
      }))
      .sort((a, b) => b.likes - a.likes) // Сортируем по лайкам
  }

  /**
   * Получить изображения альбома по MBID
   * 
   * @param mbid - MusicBrainz ID альбома
   */
  async getAlbumImages(mbid: string): Promise<FanartAlbumImages | null> {
    if (!mbid) {
      console.warn('[Fanart.tv] MBID is required')
      return null
    }

    const response = await this.request<FanartAlbumResponse>(`/music/albums/${mbid}`)

    if (!response) {
      return null
    }

    return {
      name: response.name,
      mbid: response.musicbrainz_id,
      covers: this.extractImages(response.albumcover || []),
      cdarts: this.extractImages(response.cdart || []),
    }
  }

  /**
   * Получить лучшее изображение (с наибольшим количеством лайков)
   */
  private getBestImage(images: FanartImage[]): FanartImageItem | null {
    if (!images || images.length === 0) {
      return null
    }

    const extracted = this.extractImages(images)
    return extracted[0] || null
  }

  /**
   * Получить лучший логотип артиста
   */
  async getBestArtistLogo(mbid: string): Promise<FanartImageItem | null> {
    const images = await this.getArtistImages(mbid)
    return images?.logos[0] || null
  }

  /**
   * Получить лучший фон артиста
   */
  async getBestArtistBackground(mbid: string): Promise<FanartImageItem | null> {
    const images = await this.getArtistImages(mbid)
    return images?.backgrounds[0] || null
  }

  /**
   * Получить лучшую обложку альбома
   */
  async getBestAlbumCover(mbid: string): Promise<FanartImageItem | null> {
    const images = await this.getAlbumImages(mbid)
    return images?.covers[0] || null
  }

  /**
   * Очистка кэша
   */
  clearCache(): void {
    this.cache.clear()
    console.log('[Fanart.tv] Cache cleared')
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
export const fanartService = new FanartService()

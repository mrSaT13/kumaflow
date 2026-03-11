/**
 * Fanart.tv API Client
 * 
 * Интеграция с Fanart.tv для получения:
 * - Обложек артистов (artistthumb, artistbackground)
 * - Логотипов (musiclogo)
 * - Баннеров (musicbanner)
 * 
 * API: https://fanart.tv/api/
 * Требуется API ключ (бесплатно)
 * Rate Limit: 1 запрос/сек (без ключа), 10 запросов/сек (с ключом)
 */

export interface FanartImage {
  id: string
  url: string
  lang: string
  likes: string
  discord: string
  width: string
  height: string
}

export interface FanartArtistResponse {
  name: string
  mbid_id: string
  artistthumb?: FanartImage[]
  artistbackground?: FanartImage[]
  musiclogo?: FanartImage[]
  musicbanner?: FanartImage[]
  hdmusiclogo?: FanartImage[]
}

class FanartTvService {
  private apiKey: string = ''
  private baseUrl: string = 'https://webservice.fanart.tv/v3'
  private cache: Map<string, { data: any; expires: number }> = new Map()
  private readonly CACHE_TTL: number = 7 * 24 * 60 * 60 * 1000 // 7 дней
  private readonly RATE_LIMIT_DELAY: number = 100 // 10 запросов/сек
  private lastRequestTime: number = 0

  /**
   * Инициализация сервиса с API ключом
   */
  initialize(apiKey: string): void {
    this.apiKey = apiKey
    console.log('[Fanart.tv] Service initialized')
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
  private async request<T>(endpoint: string): Promise<T | null> {
    if (!this.apiKey) {
      console.warn('[Fanart.tv] API key not set')
      return null
    }

    await this.rateLimit()

    // Проверка кэша
    const cacheKey = endpoint
    const cached = this.cache.get(cacheKey)

    if (cached && cached.expires > Date.now()) {
      console.log(`[Fanart.tv] Cache hit: ${endpoint}`)
      return cached.data as T
    }

    try {
      const url = `${this.baseUrl}${endpoint}?api_key=${this.apiKey}`
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[Fanart.tv] Not found: ${endpoint}`)
          return null
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      // Сохраняем в кэш
      this.cache.set(cacheKey, {
        data,
        expires: Date.now() + this.CACHE_TTL,
      })

      return data as T
    } catch (error) {
      console.error(`[Fanart.tv] Request error:`, error)
      return null
    }
  }

  /**
   * Получить изображения артиста по MusicBrainz ID
   */
  async getArtistImages(mbid: string): Promise<FanartArtistResponse | null> {
    if (!mbid) {
      console.warn('[Fanart.tv] No MBID provided')
      return null
    }

    console.log(`[Fanart.tv] Fetching images for MBID: ${mbid}`)
    const response = await this.request<FanartArtistResponse>(`/music/${mbid}`)
    return response
  }

  /**
   * Получить лучшую обложку артиста
   */
  async getArtistThumb(mbid: string): Promise<string | null> {
    const data = await this.getArtistImages(mbid)
    
    if (data?.artistthumb && data.artistthumb.length > 0) {
      // Сортируем по likes и берём лучшую
      const sorted = [...data.artistthumb].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      console.log(`[Fanart.tv] Found ${sorted.length} artist thumbs, using best`)
      return sorted[0].url
    }

    return null
  }

  /**
   * Получить фон артиста (artistbackground)
   */
  async getArtistBackground(mbid: string): Promise<string | null> {
    const data = await this.getArtistImages(mbid)
    
    if (data?.artistbackground && data.artistbackground.length > 0) {
      const sorted = [...data.artistbackground].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      console.log(`[Fanart.tv] Found ${sorted.length} backgrounds, using best`)
      return sorted[0].url
    }

    return null
  }

  /**
   * Получить логотип артиста
   */
  async getArtistLogo(mbid: string): Promise<string | null> {
    const data = await this.getArtistImages(mbid)
    
    // Пробуем hdmusiclogo сначала, потом musiclogo
    if (data?.hdmusiclogo && data.hdmusiclogo.length > 0) {
      const sorted = [...data.hdmusiclogo].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      console.log(`[Fanart.tv] Found ${sorted.length} HD logos, using best`)
      return sorted[0].url
    }

    if (data?.musiclogo && data.musiclogo.length > 0) {
      const sorted = [...data.musiclogo].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      console.log(`[Fanart.tv] Found ${sorted.length} logos, using best`)
      return sorted[0].url
    }

    return null
  }

  /**
   * Получить баннер артиста
   */
  async getArtistBanner(mbid: string): Promise<string | null> {
    const data = await this.getArtistImages(mbid)
    
    if (data?.musicbanner && data.musicbanner.length > 0) {
      const sorted = [...data.musicbanner].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      console.log(`[Fanart.tv] Found ${sorted.length} banners, using best`)
      return sorted[0].url
    }

    return null
  }

  /**
   * Получить все изображения артиста (массив URL)
   */
  async getAllArtistImages(mbid: string): Promise<{
    thumb?: string
    background?: string
    logo?: string
    banner?: string
  }> {
    const data = await this.getArtistImages(mbid)
    
    if (!data) return {}

    const result: {
      thumb?: string
      background?: string
      logo?: string
      banner?: string
    } = {}

    // Thumb
    if (data.artistthumb?.length) {
      const sorted = [...data.artistthumb].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      result.thumb = sorted[0].url
    }

    // Background
    if (data.artistbackground?.length) {
      const sorted = [...data.artistbackground].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      result.background = sorted[0].url
    }

    // Logo (HD приоритет)
    if (data.hdmusiclogo?.length) {
      const sorted = [...data.hdmusiclogo].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      result.logo = sorted[0].url
    } else if (data.musiclogo?.length) {
      const sorted = [...data.musiclogo].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      result.logo = sorted[0].url
    }

    // Banner
    if (data.musicbanner?.length) {
      const sorted = [...data.musicbanner].sort((a, b) => 
        parseInt(b.likes) - parseInt(a.likes)
      )
      result.banner = sorted[0].url
    }

    return result
  }
}

export const fanartTvService = new FanartTvService()

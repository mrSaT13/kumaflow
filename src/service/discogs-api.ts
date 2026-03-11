/**
 * Discogs API Client
 * 
 * База данных музыкальных релизов
 * https://www.discogs.com/developers
 * 
 * OAuth 1.0a аутентификация
 * Rate Limit: 60 запросов/минуту
 */

import CryptoJS from 'crypto-js'

export interface DiscogsRelease {
  id: number
  title: string
  year: number
  artists: Array<{ name: string }>
  genres: string[]
  styles: string[]
  country: string
  released: string
  tracklist: Array<{
    title: string
    duration?: string
    position?: string
  }>
  thumb?: string
  cover_image?: string
  labels: Array<{ name: string }>
  format: string[]
}

export interface DiscogsArtist {
  id: number
  name: string
  realname?: string
  profile?: string
  urls?: string[]
  images?: Array<{
    uri: string
    width: number
    height: number
  }>
}

class DiscogsService {
  private consumerKey: string = ''
  private consumerSecret: string = ''
  private token: string = ''
  private tokenSecret: string = ''
  private baseUrl: string = 'https://api.discogs.com'
  private cache: Map<string, { data: any; expires: number }> = new Map()
  private readonly CACHE_TTL: number = 24 * 60 * 60 * 1000 // 24 часа
  private readonly RATE_LIMIT_DELAY: number = 1000 // 60 запросов/минуту
  private lastRequestTime: number = 0

  /**
   * Инициализация сервиса с учётными данными
   */
  initialize(consumerKey: string, consumerSecret: string, token: string = '', tokenSecret: string = ''): void {
    this.consumerKey = consumerKey
    this.consumerSecret = consumerSecret
    this.token = token
    this.tokenSecret = tokenSecret
    console.log('[Discogs] Service initialized')
  }

  /**
   * Проверка инициализации
   */
  isInitialized(): boolean {
    return !!this.consumerKey && !!this.consumerSecret
  }

  /**
   * Проверка полной авторизации (с токенами)
   */
  isAuthorized(): boolean {
    return this.isInitialized() && !!this.token && !!this.tokenSecret
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
   * Генерация OAuth подписи
   */
  private generateOAuthSignature(method: string, url: string, params: Record<string, string>): string {
    const normalizedParams = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&')

    const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(normalizedParams)}`
    const signingKey = `${encodeURIComponent(this.consumerSecret)}&${encodeURIComponent(this.tokenSecret)}`

    return CryptoJS.HmacSHA1(baseString, signingKey).toString(CryptoJS.enc.Base64)
  }

  /**
   * OAuth заголовки
   */
  private getOAuthHeader(params: Record<string, string>): string {
    const oauthParams = Object.entries(params)
      .map(([key, value]) => `${key}="${encodeURIComponent(value)}"`)
      .join(', ')

    return `OAuth ${oauthParams}`
  }

  /**
   * GET запрос к Discogs API (без OAuth для публичных данных)
   */
  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    if (!this.isInitialized()) {
      console.warn('[Discogs] Not initialized')
      return null
    }

    // Проверка кэша
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`
    const cached = this.cache.get(cacheKey)

    if (cached && cached.expires > Date.now()) {
      console.log(`[Discogs] Cache hit: ${endpoint}`)
      return cached.data as T
    }

    await this.rateLimit()

    try {
      const url = new URL(`${this.baseUrl}${endpoint}`)
      
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })

      const headers: HeadersInit = {
        'User-Agent': 'KumaFlow/1.0',
        'Accept': 'application/json',
      }

      const response = await fetch(url.toString(), { headers })

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('[Discogs] Rate limit exceeded, waiting...')
          await new Promise(resolve => setTimeout(resolve, 2000))
          return this.request<T>(endpoint, params)
        }

        console.error(`[Discogs] HTTP error ${response.status}: ${endpoint}`)
        return null
      }

      const data = await response.json()

      // Кэширование успешного ответа
      this.cache.set(cacheKey, {
        data,
        expires: Date.now() + this.CACHE_TTL,
      })

      return data as T
    } catch (error) {
      console.error(`[Discogs] Request failed: ${endpoint}`, error)
      return null
    }
  }

  /**
   * Поиск артиста по имени
   */
  async searchArtist(query: string, limit: number = 10): Promise<DiscogsArtist[]> {
    const response = await this.request<any>('/database/search', {
      q: query,
      type: 'artist',
      per_page: limit.toString(),
    })

    if (!response?.results) {
      return []
    }

    return response.results.map((result: any) => ({
      id: result.id,
      name: result.title,
      realname: result.realname,
      profile: result.profile,
      urls: result.uri ? [result.uri] : [],
      images: result.thumb ? [{ uri: result.thumb, width: 200, height: 200 }] : [],
    }))
  }

  /**
   * Получить информацию об артисте
   */
  async getArtist(artistId: string): Promise<DiscogsArtist | null> {
    return this.request<DiscogsArtist>(`/artists/${artistId}`)
  }

  /**
   * Получить релизы артиста
   */
  async getArtistReleases(artistId: string, limit: number = 20): Promise<DiscogsRelease[]> {
    const response = await this.request<any>(`/artists/${artistId}/releases`, {
      per_page: limit.toString(),
      sort: 'year',
      sort_order: 'desc',
    })

    if (!response?.releases) {
      return []
    }

    return response.releases
      .filter((r: any) => r.role === 'Main' || r.role === undefined)
      .map((release: any) => ({
        id: release.id,
        title: release.title,
        year: release.year,
        artists: release.artists?.map((a: any) => ({ name: a.name })) || [],
        genres: release.genre || [],
        styles: release.style || [],
        country: release.country || '',
        released: release.released || '',
        tracklist: release.tracklist || [],
        thumb: release.thumb,
        cover_image: release.cover_image,
        labels: release.labels || [],
        format: release.format || [],
      }))
  }

  /**
   * Получить информацию о релизе
   */
  async getRelease(releaseId: string): Promise<DiscogsRelease | null> {
    return this.request<DiscogsRelease>(`/masters/${releaseId}`)
  }

  /**
   * Поиск релизов по названию
   */
  async searchReleases(query: string, limit: number = 20): Promise<DiscogsRelease[]> {
    const response = await this.request<any>('/database/search', {
      q: query,
      type: 'release',
      per_page: limit.toString(),
    })

    if (!response?.results) {
      return []
    }

    return response.results.map((result: any) => ({
      id: result.id,
      title: result.title,
      year: result.year,
      artists: result.artists?.map((a: any) => ({ name: a.name })) || [],
      genres: result.genre || [],
      styles: result.style || [],
      thumb: result.thumb,
      format: result.format || [],
    }))
  }

  /**
   * Получить новые релизы артиста (за последний год)
   */
  async getNewReleases(artistId: string): Promise<DiscogsRelease[]> {
    const releases = await this.getArtistReleases(artistId, 50)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    return releases.filter(release => {
      if (!release.released) return false
      const releaseDate = new Date(release.released)
      return releaseDate >= oneYearAgo
    })
  }

  /**
   * Очистка кэша
   */
  clearCache(): void {
    this.cache.clear()
    console.log('[Discogs] Cache cleared')
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
export const discogsService = new DiscogsService()

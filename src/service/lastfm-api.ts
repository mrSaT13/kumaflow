/**
 * Last.fm API Client
 *
 * Интеграция с Last.fm для получения:
 * - Похожих артистов (для рекомендаций)
 * - Тегов/жанров (для ML классификации)
 * - Биографий артистов
 * - Изображений
 * - Топ треков артиста
 *
 * API Key: https://www.last.fm/api/account/create
 * Rate Limit: 5 запросов/сек, 50k вызовов/день
 */

import CryptoJS from 'crypto-js'
import { fetchWithCorsProxy } from '@/utils/cors-proxy'
import { isDesktop } from '@/utils/desktop'

interface LastFmArtist {
  name: string
  mbid?: string
  url: string
  image?: Array<{
    '#text': string
    size: string
  }>
}

interface LastFmTag {
  name: string
  url: string
  count?: string
}

interface LastFmSimilarArtistResponse {
  similarartists?: {
    artist: LastFmArtist[]
  }
}

interface LastFmTopTagsResponse {
  toptags?: {
    tag: LastFmTag[]
  }
}

interface LastFmArtistInfoResponse {
  artist?: {
    name: string
    mbid?: string
    url: string
    bio?: {
      summary: string
      content: string
    }
    image?: Array<{
      '#text': string
      size: string
    }>
    similar?: {
      artist: LastFmArtist[]
    }
    tags?: {
      tag: LastFmTag[]
    }
  }
}

interface LastFmTopTracksResponse {
  toptracks?: {
    track: Array<{
      name: string
      url: string
      mbid?: string
    }>
  }
}

export interface LastFmSimilarArtist {
  name: string
  mbid?: string
  url: string
  image?: string
}

export interface LastFmTag {
  name: string
  count?: number
}

export interface LastFmArtistInfo {
  name: string
  mbid?: string
  url: string
  bio?: string
  image?: string
  similarArtists?: LastFmSimilarArtist[]
  tags?: LastFmTag[]
}

class LastFmService {
  private apiKey: string = ''
  private apiSecret: string = ''
  private sessionKey: string = ''
  private baseUrl: string = 'https://ws.audioscrobbler.com/2.0/'
  private scrobbleUrl: string = 'http://ws.audioscrobbler.com/2.0/'  // HTTP (не HTTPS) для scrobbling!
  private authUrl: string = 'https://www.last.fm/api/auth'
  private cache: Map<string, { data: any; expires: number }> = new Map()
  private readonly CACHE_TTL: number = 7 * 24 * 60 * 60 * 1000 // 7 дней
  private readonly RATE_LIMIT_DELAY: number = 200 // 5 запросов/сек (консервативно)
  private lastRequestTime: number = 0
  private lastApiError: string | null = null
  private apiBlocked = false
  private apiBlockedReason: string | null = null
  private loggedErrors = new Set<string>()

  getLastApiError(): string | null {
    return this.lastApiError
  }

  isApiBlocked(): boolean {
    return this.apiBlocked
  }

  getApiBlockedReason(): string | null {
    return this.apiBlockedReason
  }

  private logOnce(key: string, level: 'warn' | 'error', ...args: unknown[]) {
    if (this.loggedErrors.has(key)) return
    this.loggedErrors.add(key)
    console[level]('[Last.fm]', ...args)
  }

  private markApiBlocked(data: Record<string, unknown> | null, status?: number) {
    if (this.apiBlocked) return

    const code = data?.error
    const denied =
      status === 403 ||
      code === 11 ||
      code === '11' ||
      (typeof data?.message === 'string' &&
        data.message.toLowerCase().includes('access denied'))

    if (!denied) return

    this.apiBlocked = true
    this.apiBlockedReason = String(data?.message ?? `HTTP ${status ?? code}`)
    this.logOnce(
      'api-blocked',
      'warn',
      `API недоступен: ${this.apiBlockedReason}. Дальнейшие запросы Last.fm пропущены.`,
    )
  }

  private getApiBaseUrl(useHttp = false): string {
    if (isDesktop()) {
      return useHttp ? this.scrobbleUrl : this.baseUrl
    }

    if (import.meta.env.DEV) {
      return '/lastfm-api'
    }

    return useHttp ? this.scrobbleUrl : this.baseUrl
  }

  private getRemoteApiUrl(useHttp = false): string {
    return useHttp ? this.scrobbleUrl : this.baseUrl
  }

  private async parseResponseJson(response: Response): Promise<Record<string, unknown> | null> {
    const text = await response.text()
    if (!text) return null

    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      console.error('[Last.fm] Non-JSON response:', text.slice(0, 300))
      return { raw: text }
    }
  }

  private async postJsonWithFallback(
    localUrl: string,
    remoteUrl: string,
    body: string,
    method: string,
  ): Promise<Record<string, unknown> | null> {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }

    const attempts: Array<{ label: string; fn: () => Promise<Response> }> = []

    if (!isDesktop()) {
      if (import.meta.env.DEV) {
        attempts.push({ label: 'dev-proxy', fn: () => fetch(localUrl, init) })
      } else {
        attempts.push({ label: 'cors-proxy', fn: () => fetchWithCorsProxy(remoteUrl, init) })
      }
    }

    for (const attempt of attempts) {
      try {
        const response = await attempt.fn()
        const data = await this.parseResponseJson(response)

        if (data?.error) {
          this.lastApiError = String(data.message ?? `Last.fm error ${data.error}`)
          console.error(
            `[Last.fm] API error via ${attempt.label}:`,
            data.error,
            data.message ?? '',
          )
        } else {
          this.lastApiError = null
        }

        if (!response.ok) {
          this.lastApiError = this.lastApiError ?? `HTTP ${response.status}`
          console.error(
            `[Last.fm] POST HTTP ${response.status} via ${attempt.label} (${method}):`,
            data,
          )
          continue
        }

        return data
      } catch (error) {
        console.warn(`[Last.fm] POST failed via ${attempt.label} (${method}):`, error)
      }
    }

    return null
  }

  private shouldUseCorsProxy(): boolean {
    return !isDesktop() && !import.meta.env.DEV
  }

  /**
   * Инициализация сервиса с API ключом и секретом
   */
  initialize(apiKey: string, apiSecret?: string): void {
    const oldKey = this.apiKey
    this.apiKey = apiKey
    this.apiSecret = apiSecret || ''
    this.apiBlocked = false
    this.apiBlockedReason = null
    this.loggedErrors.clear()
    console.log('[Last.fm] Service initialized:', {
      apiKey: apiKey ? '***' + apiKey.slice(-8) : 'NONE',
      apiSecret: apiSecret ? '***' + apiSecret.slice(-8) : 'NONE',
      keyChanged: oldKey !== apiKey,
    })
  }

  /**
   * Установить session key (после OAuth)
   */
  setSessionKey(key: string): void {
    this.sessionKey = key
    console.log('[Last.fm] Session key set')
  }

  /**
   * Получить session key
   */
  getSessionKey(): string {
    return this.sessionKey
  }

  /**
   * Проверка инициализации
   */
  isInitialized(): boolean {
    return !!this.apiKey
  }

  /**
   * Проверка авторизации (есть session key)
   */
  isAuthorized(): boolean {
    return !!this.sessionKey
  }

  /**
   * Получить URL для авторизации
   */
  getAuthorizationUrl(token?: string): string {
    const url = new URL(this.authUrl)
    url.searchParams.set('api_key', this.apiKey)
    if (token) {
      url.searchParams.set('token', token)
    }
    return url.toString()
  }

  /**
   * Разбор ответа Last.fm (JSON или XML из Electron IPC)
   */
  private parseLastFmResponse(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object') return null

    const payload = data as Record<string, unknown>

    if (payload.token || payload.session || payload.error) {
      return payload
    }

    if (typeof payload.raw === 'string') {
      const raw = payload.raw
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        if (payload.status === 'ok') return payload
      }
    }

    return payload
  }

  /**
   * GET-запрос с обходом CORS в браузере
   */
  private buildGetUrls(method: string, params: Record<string, string> = {}) {
    const build = (base: string) => {
      const url = base.startsWith('/')
        ? new URL(base, window.location.origin)
        : new URL(base)
      url.searchParams.set('method', method)
      url.searchParams.set('api_key', this.apiKey)
      url.searchParams.set('format', 'json')
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
      return url.toString()
    }

    return {
      local: build(this.getApiBaseUrl()),
      remote: build(this.getRemoteApiUrl()),
    }
  }

  private async fetchGetJson(
    localUrl: string,
    remoteUrl: string,
    method: string,
  ): Promise<Record<string, unknown> | null> {
    if (this.apiBlocked) return null

    const win = window as Window & {
      api?: {
        fetchExternal?: (url: string) => Promise<unknown>
      }
    }

    try {
      if (isDesktop() && win.api?.fetchExternal) {
        const data = await win.api.fetchExternal(remoteUrl)
        if (data && typeof data === 'object') {
          const payload = data as Record<string, unknown>
          if (payload.error) this.markApiBlocked(payload)
          return payload.error ? null : payload
        }
        return null
      }

      const attempts: Array<{ label: string; fn: () => Promise<Response> }> = []
      if (!isDesktop()) {
        if (import.meta.env.DEV) {
          // В dev используем только локальный прокси — никаких публичных CORS сервисов
          attempts.push({ label: 'dev-proxy', fn: () => fetch(localUrl) })
        } else {
          attempts.push({ label: 'cors-proxy', fn: () => fetchWithCorsProxy(remoteUrl) })
        }
      }

      for (const attempt of attempts) {
        try {
          const response = await attempt.fn()
          const data = await this.parseResponseJson(response)

          if (data?.error) {
            this.markApiBlocked(data, response.status)
            this.lastApiError = String(data.message ?? `Last.fm error ${data.error}`)
          }

          if (!response.ok) {
            this.markApiBlocked(data, response.status)
            continue
          }

          if (data?.error) return null
          return data
        } catch (error) {
          this.logOnce(`get-${method}`, 'warn', `GET failed via ${attempt.label}:`, error)
        }
      }

      return null
    } catch (error) {
      this.logOnce(`get-${method}-fatal`, 'error', 'fetchGetJson error:', error)
      return null
    }
  }

  /**
   * Подписанный POST (auth, scrobble)
   */
  private async signedPostRequest(
    method: string,
    params: Record<string, string> = {},
    options: { useHttp?: boolean; json?: boolean } = {},
  ): Promise<Record<string, unknown> | null> {
    const { useHttp = false, json = true } = options

    if (!this.apiKey || !this.apiSecret) {
      console.warn('[Last.fm] API key and secret required for signed POST:', method)
      return null
    }

    await this.rateLimit()

    const sigParams: Record<string, string> = {
      api_key: this.apiKey,
      method,
      ...params,
    }
    const apiSig = this.generateSignature(sigParams)
    const bodyParams: Record<string, string> = {
      method,
      api_key: this.apiKey,
      api_sig: apiSig,
      ...params,
    }
    if (json) {
      bodyParams.format = 'json'
    }
    const body = new URLSearchParams(bodyParams)

    const localUrl = this.getApiBaseUrl(useHttp)
    const remoteUrl = this.getRemoteApiUrl(useHttp)
    const win = window as Window & {
      api?: {
        lastFmScrobble?: (url: string, method: string, body: string) => Promise<unknown>
      }
    }

    try {
      if (isDesktop() && win.api?.lastFmScrobble) {
        const data = await win.api.lastFmScrobble(remoteUrl, 'POST', body.toString())
        return this.parseLastFmResponse(data)
      }

      return await this.postJsonWithFallback(localUrl, remoteUrl, body.toString(), method)
    } catch (error) {
      console.error(`[Last.fm] signedPostRequest error (${method}):`, error)
      return null
    }
  }

  /**
   * Шаг 1: Получить request token
   */
  async getToken(): Promise<string | null> {
    const data = await this.signedPostRequest('auth.getToken')

    if (typeof data?.token === 'string') {
      console.log('[Last.fm] Got token:', data.token)
      return data.token
    }

    console.error('[Last.fm] getToken error:', data)
    return null
  }

  /**
   * Шаг 2: Получить session key из token
   */
  async getSession(token: string): Promise<string | null> {
    const data = await this.signedPostRequest('auth.getSession', { token })
    const session = data?.session as { key?: string } | undefined

    if (session?.key) {
      this.sessionKey = session.key
      console.log('[Last.fm] Got session key:', this.sessionKey)
      return this.sessionKey
    }

    console.error('[Last.fm] getSession error:', data)
    return null
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
   * Генерация API signature (MD5 хеш)
   */
  private generateSignature(params: Record<string, string>): string {
    // Сортируем параметры по алфавиту
    const sorted = Object.keys(params)
      .sort()
      .map(key => `${key}${params[key]}`)
      .join('')

    // Добавляем secret и хешируем
    const signature = sorted + this.apiSecret
    return this.md5(signature)
  }

  /**
   * MD5 хеш функция (через crypto-js)
   */
  private md5(str: string): string {
    // Используем импортированный CryptoJS
    return CryptoJS.MD5(str).toString()
  }

  /**
   * POST запрос к Last.fm API (для scrobbling/nowplaying)
   */
  private async postRequest(method: string, params: Record<string, string>): Promise<any> {
    return this.signedPostRequest(method, params, { useHttp: true, json: false })
  }

  /**
   * GET запрос к Last.fm API
   */
  private async request<T>(method: string, params: Record<string, string> = {}): Promise<T | null> {
    if (!this.apiKey || this.apiBlocked) {
      return null
    }

    // Проверка кэша
    const cacheKey = `${method}:${JSON.stringify(params)}`
    const cached = this.cache.get(cacheKey)
    
    if (cached && cached.expires > Date.now()) {
      return cached.data as T
    }

    await this.rateLimit()

    try {
      const { local, remote } = this.buildGetUrls(method, params)
      const data = await this.fetchGetJson(local, remote, method)
      if (!data) return null
      
      // Кэширование успешного ответа
      this.cache.set(cacheKey, {
        data,
        expires: Date.now() + this.CACHE_TTL,
      })

      return data as T
    } catch (error) {
      this.logOnce(`request-${method}`, 'error', `Request failed: ${method}`, error)
      return null
    }
  }

  static isQueryableArtist(artistName: string): boolean {
    const normalized = artistName.trim().toLowerCase()
    if (!normalized) return false
    return ![
      '[unknown artist]',
      'unknown artist',
      'various artists',
      'разные исполнители',
    ].includes(normalized)
  }

  isQueryableArtist(artistName: string): boolean {
    return LastFmService.isQueryableArtist(artistName)
  }

  /**
   * Получить похожих артистов
   * 
   * @param artistName - Имя артиста
   * @param limit - Количество (макс 20)
   */
  async getSimilarArtists(artistName: string, limit: number = 20): Promise<LastFmSimilarArtist[]> {
    const response = await this.request<LastFmSimilarArtistResponse>('artist.getSimilar', {
      artist: artistName,
      limit: limit.toString(),
    })

    if (!response?.similarartists?.artist) {
      return []
    }

    return response.similarartists.artist.map(artist => ({
      name: artist.name,
      mbid: artist.mbid,
      url: artist.url,
      image: artist.image?.find(img => img.size === 'large')?.['#text'],
    }))
  }

  /**
   * Получить топ теги артиста (жанры/настроения)
   * 
   * @param artistName - Имя артиста
   * @param limit - Количество (макс 100)
   */
  async getArtistTopTags(artistName: string, limit: number = 50): Promise<LastFmTag[]> {
    const response = await this.request<LastFmTopTagsResponse>('artist.getTopTags', {
      artist: artistName,
      limit: limit.toString(),
    })

    if (!response?.toptags?.tag) {
      return []
    }

    return response.toptags.tag
      .slice(0, limit)
      .map(tag => ({
        name: tag.name,
        count: tag.count ? parseInt(tag.count, 10) : undefined,
      }))
  }

  /**
   * Получить полную информацию об артисте
   * 
   * @param artistName - Имя артиста
   * @param lang - Язык (ru, en, и т.д.)
   */
  async getArtistInfo(artistName: string, lang: string = 'en'): Promise<LastFmArtistInfo | null> {
    const response = await this.request<LastFmArtistInfoResponse>('artist.getInfo', {
      artist: artistName,
      lang,
    })

    if (!response?.artist) {
      return null
    }

    const artist = response.artist

    return {
      name: artist.name,
      mbid: artist.mbid,
      url: artist.url,
      bio: artist.bio?.summary,
      image: artist.image?.find(img => img.size === 'mega')?.['#text'] || 
             artist.image?.find(img => img.size === 'large')?.['#text'],
      similarArtists: artist.similar?.artist?.map(a => ({
        name: a.name,
        mbid: a.mbid,
        url: a.url,
        image: a.image?.find(img => img.size === 'large')?.['#text'],
      })),
      tags: artist.tags?.tag?.map(t => ({
        name: t.name,
        count: t.count ? parseInt(t.count, 10) : undefined,
      })),
    }
  }

  /**
   * Получить топ треки артиста
   *
   * @param artistName - Имя артиста
   * @param limit - Количество (макс 100)
   */
  async getArtistTopTracks(artistName: string, limit: number = 50): Promise<Array<{ name: string; mbid?: string; url: string }>> {
    const response = await this.request<LastFmTopTracksResponse>('artist.getTopTracks', {
      artist: artistName,
      limit: limit.toString(),
    })

    if (!response?.toptracks?.track) {
      return []
    }

    return response.toptracks.track.slice(0, limit).map(track => ({
      name: track.name,
      mbid: track.mbid,
      url: track.url,
    }))
  }

  /**
   * Scrobble - отправка информации о прослушивании в Last.fm
   */
  async scrobble(
    artist: string,
    track: string,
    timestamp: number,
    album?: string,
    duration?: number
  ): Promise<boolean> {
    const sessionKey = this.getSessionKey()

    if (!sessionKey) {
      console.error('[Last.fm] Scrobble failed: No session key')
      return false
    }

    const params: Record<string, string> = {
      sk: sessionKey,
      artist: artist,
      track: track,
      timestamp: timestamp.toString(),
    }

    if (album) params.album = album
    if (duration) params.duration = duration.toString()

    const response = await this.postRequest('track.scrobble', params)

    if (!response) {
      console.error('[Last.fm] Scrobble failed: No response')
      return false
    }

    // Last.fm возвращает XML, проверяем статус
    if (response.status === 'ok') {
      console.log('[Last.fm] ✅ Scrobble sent:', track, artist)
      return true
    }

    if (response.error || response.message) {
      console.error('[Last.fm] Scrobble error:', response.code, response.message)
      return false
    }

    console.error('[Last.fm] Scrobble failed: Unknown response', response)
    return false
  }

  /**
   * Now Playing - обновление текущего трека в Last.fm
   */
  async updateNowPlaying(
    artist: string,
    track: string,
    album?: string,
    duration?: number
  ): Promise<boolean> {
    const sessionKey = this.getSessionKey()

    if (!sessionKey) {
      console.error('[Last.fm] Now Playing failed: No session key')
      return false
    }

    const params: Record<string, string> = {
      sk: sessionKey,
      artist: artist,
      track: track,
    }

    if (album) params.album = album
    if (duration) params.duration = duration.toString()

    const response = await this.postRequest('track.updateNowPlaying', params)

    if (!response) {
      console.error('[Last.fm] Now Playing failed: No response')
      return false
    }

    // Last.fm возвращает XML, проверяем статус
    if (response.status === 'ok') {
      console.log('[Last.fm] ✅ Now Playing sent:', track, artist)
      return true
    }

    if (response.error || response.message) {
      console.error('[Last.fm] Now Playing error:', response.code, response.message)
      return false
    }

    console.error('[Last.fm] Now Playing failed: Unknown response', response)
    return false
  }

  /**
   * Проверить работает ли API ключ (тестовый запрос)
   */
  async testApiKey(): Promise<boolean> {
    try {
      const response = await this.request<any>('artist.getInfo', {
        artist: 'The Beatles',
      })
      return !!response
    } catch {
      return false
    }
  }

  /**
   * Получить похожие треки (через похожих артистов)
   * Если трек не найден, ищем треки у похожих артистов
   *
   * @param trackName - Название трека
   * @param artistName - Имя артиста
   * @param limit - Количество результатов
   */
  async getSimilarTracks(trackName: string, artistName: string, limit: number = 10): Promise<Array<{ name: string; artist: string; url: string }>> {
    try {
      // 1. Получаем похожих артистов
      const similarArtists = await this.getSimilarArtists(artistName, 5)

      if (similarArtists.length === 0) {
        return []
      }

      // 2. Для каждого похожего артиста берем топ треки
      const allTracks: Array<{ name: string; artist: string; url: string }> = []

      for (const artist of similarArtists) {
        const topTracks = await this.getArtistTopTracks(artist.name, 5)
        allTracks.push(...topTracks.map(t => ({
          name: t.name,
          artist: artist.name,
          url: t.url,
        })))

        if (allTracks.length >= limit * 2) break
      }

      // 3. Убираем дубли и возвращаем
      const uniqueTracks = allTracks.filter((t, i, arr) =>
        arr.findIndex(x => x.name === t.name && x.artist === t.artist) === i
      )

      return uniqueTracks.slice(0, limit)
    } catch (error) {
      console.warn('[Last.fm] getSimilarTracks error:', error)
      return []
    }
  }

  /**
   * Artist Radio: получить треки для радио артиста
   * 
   * @param artistName - Имя артиста
   * @param limit - Количество треков (макс 100)
   * @returns Массив треков от похожих артистов
   */
  async getArtistRadio(artistName: string, limit: number = 50): Promise<Array<{ name: string; artist: string; mbid?: string }>> {
    console.log('[Last.fm] Generating artist radio for:', artistName)

    try {
      // 1. Получаем 20 похожих артистов
      const similarArtists = await this.getSimilarArtists(artistName, 20)
      console.log('[Last.fm] Found', similarArtists.length, 'similar artists')

      if (similarArtists.length === 0) {
        console.warn('[Last.fm] No similar artists found')
        return []
      }

      // 2. Для каждого артиста берем по 3-5 топ треков
      const allTracks: Array<{ name: string; artist: string; mbid?: string }> = []

      for (const artist of similarArtists) {
        const topTracks = await this.getArtistTopTracks(artist.name, 5)
        
        // Берем только первые 3 трека чтобы не перегружать
        topTracks.slice(0, 3).forEach(track => {
          allTracks.push({
            name: track.name,
            artist: artist.name,
            mbid: track.mbid,
          })
        })

        // Останавливаемся когда набрали достаточно
        if (allTracks.length >= limit) break
      }

      // 3. Перемешиваем треки
      const shuffled = allTracks.sort(() => Math.random() - 0.5)

      console.log('[Last.fm] Generated', shuffled.length, 'tracks for artist radio')
      return shuffled.slice(0, limit)
    } catch (error) {
      console.error('[Last.fm] getArtistRadio error:', error)
      return []
    }
  }

  /**
   * Получить теги артиста (жанры/настроения)
   * 
   * @param artistName - Имя артиста
   * @param limit - Количество тегов (макс 100)
   * @returns Массив тегов с весом
   */
  async getArtistTags(artistName: string, limit: number = 50): Promise<Array<{ name: string; count: number }>> {
    if (!LastFmService.isQueryableArtist(artistName) || this.apiBlocked) {
      return []
    }

    try {
      return await this.getArtistTopTags(artistName, limit)
    } catch {
      return []
    }
  }

  /**
   * Получить теги трека (настроения/жанры)
   * 
   * @param artistName - Имя артиста
   * @param trackName - Название трека
   * @param limit - Количество тегов
   * @returns Массив тегов с весом
   */
  async getTrackTags(artistName: string, trackName: string, limit: number = 20): Promise<Array<{ name: string; count: number }>> {
    if (!LastFmService.isQueryableArtist(artistName) || this.apiBlocked) {
      return []
    }

    await this.rateLimit()

    try {
      const response = await this.request<any>('track.getTopTags', {
        artist: artistName,
        track: trackName,
        limit: limit.toString(),
      })

      if (!response?.toptags?.tag) {
        return []
      }

      const tags = Array.isArray(response.toptags.tag)
        ? response.toptags.tag
        : [response.toptags.tag]

      return tags.slice(0, limit).map((tag: any) => ({
        name: tag.name,
        count: tag.count ? parseInt(tag.count, 10) : 0,
      }))
    } catch {
      return []
    }
  }

  /**
   * Массовое получение тегов для артистов (для ML профиля)
   * 
   * @param artists - Массив имен артистов
   * @returns Карта { artistName: теги }
   */
  async getArtistsTagsBatch(artists: string[]): Promise<Record<string, Array<{ name: string; count: number }>>> {
    console.log('[Last.fm] Getting tags for', artists.length, 'artists')
    
    const result: Record<string, Array<{ name: string; count: number }>> = {}
    
    for (const artist of artists) {
      try {
        result[artist] = await this.getArtistTags(artist, 50)
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error('[Last.fm] Failed to get tags for', artist, error)
        result[artist] = []
      }
    }
    
    console.log('[Last.fm] Got tags for', Object.keys(result).length, 'artists')
    return result
  }

  /**
   * Поиск артиста по имени
   */
  async searchArtist(query: string, limit: number = 10): Promise<LastFmSimilarArtist[]> {
    const response = await this.request<any>('artist.search', {
      artist: query,
      limit: limit.toString(),
    })

    if (!response?.results?.artistmatches?.artist) {
      return []
    }

    const artists = Array.isArray(response.results.artistmatches.artist) 
      ? response.results.artistmatches.artist 
      : [response.results.artistmatches.artist]

    return artists.map(artist => ({
      name: artist.name,
      mbid: artist.mbid,
      url: artist.url,
      image: artist.image?.find(img => img.size === 'large')?.['#text'],
    }))
  }

  /**
   * Получить глобальный топ треков (Last.fm Chart)
   *
   * @param limit - Количество (макс 100)
   */
  async getGlobalTopTracks(limit: number = 50): Promise<Array<{ name: string; artist: string; mbid?: string; url: string; image?: string }>> {
    const response = await this.request<any>('chart.getTopTracks', {
      limit: limit.toString(),
    })

    if (!response?.tracks?.track) {
      return []
    }

    const tracks = Array.isArray(response.tracks.track)
      ? response.tracks.track
      : [response.tracks.track]

    return tracks.slice(0, limit).map((track: any) => ({
      name: track.name,
      artist: track.artist?.name || '',
      mbid: track.mbid,
      url: track.url,
      image: track.image?.find((img: any) => img.size === 'large')?.['#text'],
    }))
  }

  /**
   * Очистка кэша
   */
  clearCache(): void {
    this.cache.clear()
    console.log('[Last.fm] Cache cleared')
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats(): { size: number; hits: number } {
    const now = Date.now()
    const validEntries = Array.from(this.cache.entries()).filter(
      ([, entry]) => entry.expires > now
    )
    
    return {
      size: validEntries.length,
      hits: 0, // Можно добавить счетчик хитов
    }
  }
}

// Синглтон
export const lastFmService = new LastFmService()

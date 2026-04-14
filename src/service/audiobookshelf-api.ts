/**
 * Audiobookshelf API Service
 *
 * Интеграция с Audiobookshelf сервером
 * Документация: https://www.audiobookshelf.org/guides/api/
 *
 * В Electron версии использует IPC для обхода CORS
 */

import { useAudiobookshelfStore } from '@/store/audiobookshelf.store'

export interface Audiobook {
  id: string
  libraryId: string
  title: string
  author: string
  narrator?: string
  description?: string
  coverUrl?: string
  duration: number  // секунды
  series?: { name: string; sequence: string }
  genres: string[]
  publishedYear?: string
  progress?: {
    currentTime: number
    percentage: number
    isFinished: boolean
    lastPlayedAt?: string
  }
}

export interface AudiobookshelfLibrary {
  id: string
  name: string
  mediaType: 'book' | 'podcast'
  icon?: string
}

// Проверка на Electron (через window.api)
const isElectron = () => {
  if (typeof window === 'undefined') return false
  const win = window as any
  return !!(win.api && win.api.audiobookshelfRequest)
}

// Проверка на использование CORS прокси
const useCorsProxy = () => {
  // В браузере используем import.meta.env
  if (typeof import.meta !== 'undefined') {
    return import.meta.env.VITE_USE_CORS_PROXY === 'true'
  }
  // В Node.js/Electron используем process.env
  if (typeof process !== 'undefined') {
    return process.env.USE_CORS_PROXY === 'true' || process.env.VITE_USE_CORS_PROXY === 'true'
  }
  return false
}

const getCorsProxyUrl = () => {
  if (typeof import.meta !== 'undefined') {
    return import.meta.env.VITE_CORS_PROXY_URL || 'http://localhost:3001'
  }
  if (typeof process !== 'undefined') {
    return process.env.CORS_PROXY_URL || process.env.VITE_CORS_PROXY_URL || 'http://localhost:3001'
  }
  return 'http://localhost:3001'
}

class AudiobookshelfService {
  private baseUrl: string = ''
  private apiKey: string = ''

  /**
   * Инициализация клиента
   */
  private initClient() {
    const store = useAudiobookshelfStore.getState()
    this.baseUrl = store.config.url.replace(/\/$/, '')
    this.apiKey = store.config.apiKey
  }

  /**
   * Получить базовый URL
   */
  getBaseUrl(): string {
    this.initClient()
    return this.baseUrl
  }

  /**
   * Получить API ключ
   */
  getApiKey(): string {
    this.initClient()
    return this.apiKey
  }

  /**
   * Получить сессию воспроизведения
   */
  async getPlaybackSession(bookId: string): Promise<any> {
    this.initClient()

    try {
      console.log('[Audiobookshelf] Creating playback session for:', bookId)
      const session = await this.request(
        `/api/items/${bookId}/play`,
        'POST',
        {
          deviceInfo: {
            deviceId: 'kumaflow-web',
            name: 'KumaFlow',
            capabilities: {
              canPlay: true,
              canDownload: true
            }
          },
          mediaPlayer: 'html5',
          forceDirectPlay: true
        }
      )

      console.log('[Audiobookshelf] Playback session created:', session)
      return session
    } catch (error) {
      console.error('[Audiobookshelf] Failed to create playback session:', error)
      return null
    }
  }

  /**
   * Получить URL для стриминга с учётом CORS
   */
  private getStreamUrlWithCors(bookId: string): string {
    if (useCorsProxy()) {
      // Если включён CORS прокси, используем его для стриминга
      const proxyUrl = getCorsProxyUrl()
      return `${proxyUrl}/s/item/${bookId}?token=${this.apiKey}`
    }
    return `${this.baseUrl}/s/item/${bookId}?token=${this.apiKey}`
  }

  /**
   * Выполнить запрос через IPC (Electron) или напрямую (Web)
   */
  private async request<T>(endpoint: string, method: string = 'GET', body?: any): Promise<T> {
    this.initClient()

    // В Electron используем IPC через window.api
    if (isElectron()) {
      const win = window as any
      if (win.api && win.api.audiobookshelfRequest) {
        const url = `${this.baseUrl}${endpoint}`
        return win.api.audiobookshelfRequest(url, method, body, this.apiKey)
      }
    }

    // Если включён CORS прокси
    if (useCorsProxy()) {
      const proxyUrl = getCorsProxyUrl()
      const url = `${proxyUrl}/audiobookshelf${endpoint.replace('/api', '')}`

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response.json()
    }

    // В веб-версии без прокси - прямой запрос (может не работать из-за CORS)
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Получить все библиотеки
   */
  async getLibraries(): Promise<AudiobookshelfLibrary[]> {
    try {
      const data = await this.request<any>('/api/libraries')
      return data.libraries || []
    } catch (error) {
      console.error('[Audiobookshelf] Failed to get libraries:', error)
      return []
    }
  }

  /**
   * Получить книги из библиотеки
   */
  async getAudiobooks(libraryId: string): Promise<Audiobook[]> {
    try {
      console.log('[Audiobookshelf] Loading books from library:', libraryId)
      const data = await this.request<any>(`/api/libraries/${libraryId}/items`)
      console.log('[Audiobookshelf] Received data:', data)
      
      const results = data.results || []
      console.log('[Audiobookshelf] Results count:', results.length)
      
      const books = results.map((item: any) => this.parseAudiobook(item))
      console.log('[Audiobookshelf] Parsed books:', books.length)
      
      return books
    } catch (error) {
      console.error('[Audiobookshelf] Failed to get audiobooks:', error)
      return []
    }
  }

  /**
   * Получить детальную информацию о книге
   */
  async getAudiobookDetails(bookId: string): Promise<Audiobook | null> {
    try {
      // Запрашиваем расширенную информацию с прогрессом
      const data = await this.request<any>(`/api/items/${bookId}?expanded=1&include=progress`)
      return this.parseAudiobookDetail(data)
    } catch (error) {
      console.error('[Audiobookshelf] Failed to get audiobook details:', error)
      return null
    }
  }

  /**
   * Получить прогресс пользователя для книги
   */
  async getProgress(bookId: string): Promise<{
    currentTime: number
    duration: number
    isFinished: boolean
    lastUpdate: number
  } | null> {
    try {
      const data = await this.request<any>(`/api/me/progress/${bookId}`)
      return {
        currentTime: data.currentTime || 0,
        duration: data.duration || 0,
        isFinished: data.isFinished || false,
        lastUpdate: data.lastUpdate || Date.now(),
      }
    } catch (error) {
      console.error('[Audiobookshelf] Failed to get progress:', error)
      return null
    }
  }

  /**
   * Обновить прогресс пользователя
   */
  async updateProgress(
    bookId: string,
    currentTime: number,
    duration: number,
    isFinished: boolean = false
  ): Promise<boolean> {
    try {
      await this.request(
        `/api/me/progress/${bookId}`,
        'PATCH',
        { currentTime, duration, isFinished }
      )
      return true
    } catch (error) {
      console.error('[Audiobookshelf] Failed to update progress:', error)
      return false
    }
  }

  /**
   * Начать сессию воспроизведения и получить URL для стриминга
   * POST /api/items/{id}/play - возвращает playback session
   */
  async getStreamUrl(bookId: string): Promise<string> {
    this.initClient()

    try {
      // Создаём сессию воспроизведения
      console.log('[Audiobookshelf] Creating playback session for:', bookId)
      const session: any = await this.request(
        `/api/items/${bookId}/play`,
        'POST',
        {
          deviceInfo: {
            deviceId: 'kumaflow-web',
            name: 'KumaFlow',
            capabilities: {
              canPlay: true,
              canDownload: true
            }
          },
          mediaPlayer: 'html5',
          forceDirectPlay: true
        }
      )

      console.log('[Audiobookshelf] Playback session response:', session)
      console.log('[Audiobookshelf] Session playMethod:', session.playMethod)
      console.log('[Audiobookshelf] Session audioTracks:', session.audioTracks?.length)

      // Для Direct Play (playMethod = 0) используем audioTracks[0].contentUrl
      if (session?.playMethod === 0 && session?.audioTracks?.[0]?.contentUrl) {
        const contentUrl = session.audioTracks[0].contentUrl
        const fullUrl = `${this.baseUrl}${contentUrl}?token=${this.apiKey}`
        console.log('[Audiobookshelf] Using contentUrl:', fullUrl)
        return fullUrl
      }

      // Для HLS (playMethod = 1) используем hlsUrl
      if (session?.playMethod === 1 && session?.hlsUrl) {
        console.log('[Audiobookshelf] Using hlsUrl:', session.hlsUrl)
        return session.hlsUrl
      }

      // Проверяем directPlayUrl
      if (session?.directPlayUrl) {
        console.log('[Audiobookshelf] Using directPlayUrl:', session.directPlayUrl)
        return session.directPlayUrl
      }

      // Fallback: используем /s/item/ endpoint
      const streamUrl = `${this.baseUrl}/s/item/${bookId}?token=${this.apiKey}`
      console.log('[Audiobookshelf] Using fallback /s/item/ URL:', streamUrl)
      return streamUrl
    } catch (error) {
      console.error('[Audiobookshelf] Failed to start playback session:', error)
      // Возвращаем fallback URL
      return `${this.baseUrl}/s/item/${bookId}?token=${this.apiKey}`
    }
  }

  /**
   * Получить URL обложки книги
   */
  async getCoverUrl(bookId: string): Promise<string> {
    this.initClient()
    return `${this.baseUrl}/api/items/${bookId}/cover`
  }

  /**
   * Поиск книг (через библиотеки — универсальный метод)
   */
  async searchBooks(query: string, limit: number = 10): Promise<Audiobook[]> {
    this.initClient()
    console.log('[Audiobookshelf] Search called')
    console.log('[Audiobookshelf] URL:', this.baseUrl)
    console.log('[Audiobookshelf] API Key:', this.apiKey ? 'Set' : 'NOT SET')
    console.log('[Audiobookshelf] Query:', query)

    if (!this.baseUrl) {
      console.warn('[Audiobookshelf] ⚠️ Server URL not configured!')
      return []
    }
    if (!this.apiKey) {
      console.warn('[Audiobookshelf] ⚠️ API key not configured!')
      return []
    }

    try {
      // Получаем библиотеки и ищем в первой
      console.log('[Audiobookshelf] Getting libraries for search')
      const libraries = await this.getLibraries()
      console.log('[Audiobookshelf] Found', libraries.length, 'libraries')

      if (libraries.length === 0) {
        console.warn('[Audiobookshelf] ⚠️ No libraries found!')
        return []
      }

      // Берём первую библиотеку и ищем в ней
      const libraryId = libraries[0].id
      console.log('[Audiobookshelf] Searching in library:', libraryId, libraries[0].name)

      // /api/libraries/{id}/search?q=...
      const data = await this.request<any>(`/api/libraries/${libraryId}/search?q=${encodeURIComponent(query)}&limit=${limit}`)
      console.log('[Audiobookshelf] Library search response:', JSON.stringify(data).substring(0, 300))

      const books = data?.book || []
      console.log('[Audiobookshelf] Library search found', books.length, 'books')

      if (books.length > 0) {
        console.log('[Audiobookshelf] First book:', books[0]?.libraryItem?.media?.metadata?.title || 'Unknown')
      }

      // Парсим правильно — каждый book содержит libraryItem
      return books.map((item: any) => {
        const libraryItem = item.libraryItem || item
        return this.parseAudiobook(libraryItem)
      })
    } catch (error) {
      console.error('[Audiobookshelf] Search failed:', error)
      return []
    }
  }

  /**
   * Парсинг данных книги из API
   */
  private parseAudiobook(item: any): Audiobook {
    try {
      const metadata = item.media?.metadata || {}
      const progress = item.userProgress || {}
      const progressData = progress.progress || {}

      // Обработка series - может быть объектом или массивом
      let seriesInfo
      if (metadata.series) {
        if (Array.isArray(metadata.series)) {
          seriesInfo = metadata.series.length > 0 ? metadata.series[0] : null
        } else if (typeof metadata.series === 'object') {
          seriesInfo = metadata.series
        }
      }

      return {
        id: item.id,
        libraryId: item.libraryId,
        title: metadata.title || 'Без названия',
        author: metadata.authorName || 'Неизвестный автор',
        narrator: metadata.narratorName,
        description: metadata.description,
        // Обложка - используем стандартный endpoint с токеном
        coverUrl: metadata.coverPath 
          ? `${this.baseUrl}${metadata.coverPath}?token=${this.apiKey}`
          : `${this.baseUrl}/api/items/${item.id}/cover?token=${this.apiKey}`,
        duration: item.media?.duration || 0,
        series: seriesInfo || metadata.seriesName
          ? { 
              name: seriesInfo?.name || metadata.seriesName || '', 
              sequence: seriesInfo?.sequence || '' 
            }
          : undefined,
        genres: metadata.genres || [],
        publishedYear: metadata.publishedYear,
        progress: progressData.currentTime
          ? {
              currentTime: progressData.currentTime || 0,
              percentage: progressData.percentage || 0,
              isFinished: progressData.isFinished || false,
              lastPlayedAt: progress.lastPlayedAt,
            }
          : undefined,
      }
    } catch (error) {
      console.error('[Audiobookshelf] Parse error:', error, item)
      // Возвращаем минимальный объект при ошибке парсинга
      return {
        id: item?.id || 'unknown',
        libraryId: item?.libraryId || '',
        title: item?.media?.metadata?.title || 'Неизвестно',
        author: 'Неизвестный автор',
        duration: 0,
        genres: [],
      }
    }
  }

  /**
   * Получить серии книг
   * GET /api/libraries/{libraryId}/series
   */
  async getSeries(libraryId: string): Promise<Array<{
    id: string
    name: string
    description?: string
    books: Array<{ id: string; title: string; sequence: string }>
  }>> {
    try {
      const data = await this.request<any>(`/api/libraries/${libraryId}/series`)
      return (data.series || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        books: (s.books || []).map((b: any) => ({
          id: b.id,
          title: b.title,
          sequence: b.sequence,
        })),
      }))
    } catch (error) {
      console.error('[Audiobookshelf] Get series error:', error)
      return []
    }
  }

  /**
   * Получить авторов
   * GET /api/libraries/{libraryId}/authors
   */
  async getAuthors(libraryId: string): Promise<Array<{
    id: string
    name: string
    description?: string
    books: Array<{ id: string; title: string }>
  }>> {
    try {
      const data = await this.request<any>(`/api/libraries/${libraryId}/authors`)
      return (data.authors || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        books: (a.books || []).map((b: any) => ({
          id: b.id,
          title: b.title,
        })),
      }))
    } catch (error) {
      console.error('[Audiobookshelf] Get authors error:', error)
      return []
    }
  }

  /**
   * Пакетное обновление прогресса
   * PATCH /api/me/progress/batch/update
   */
  async batchUpdateProgress(updates: Array<{
    libraryItemId: string
    currentTime: number
    duration: number
    isFinished?: boolean
  }>): Promise<boolean> {
    try {
      await this.request(`/api/me/progress/batch/update`, 'PATCH', { updates })
      return true
    } catch (error) {
      console.error('[Audiobookshelf] Batch update error:', error)
      return false
    }
  }
  private parseAudiobookDetail(item: any): Audiobook & {
    description?: string
    publishedYear?: string
    publisher?: string
    language?: string
    explicit?: boolean
    asin?: string
    isbn?: string
    tracks?: Array<{
      index: number
      title?: string
      duration: number
      filename: string
    }>
  } {
    try {
      const metadata = item.media?.metadata || {}
      const progress = item.userProgress || {}
      const progressData = progress.progress || {}
      const audioFiles = item.media?.audioFiles || []

      // Обработка series - может быть объектом или массивом
      let seriesInfo
      if (metadata.series) {
        if (Array.isArray(metadata.series)) {
          seriesInfo = metadata.series.length > 0 ? metadata.series[0] : null
        } else if (typeof metadata.series === 'object') {
          seriesInfo = metadata.series
        }
      }

      // Парсим треки/главы из audioFiles
      const tracks = audioFiles.map((file: any, index: number) => ({
        index: file.index || index,
        title: file.metadata?.title || file.metadata?.filename || `Глава ${index + 1}`,
        duration: file.duration || 0,
        filename: file.metadata?.filename || file.url || '',
      }))

      return {
        id: item.id,
        libraryId: item.libraryId,
        title: metadata.title || 'Без названия',
        author: metadata.authorName || 'Неизвестный автор',
        narrator: metadata.narratorName,
        description: metadata.description,
        // Обложка - используем стандартный endpoint с токеном
        coverUrl: metadata.coverPath 
          ? `${this.baseUrl}${metadata.coverPath}?token=${this.apiKey}`
          : `${this.baseUrl}/api/items/${item.id}/cover?token=${this.apiKey}`,
        duration: item.media?.duration || 0,
        series: seriesInfo || metadata.seriesName
          ? {
              name: seriesInfo?.name || metadata.seriesName || '',
              sequence: seriesInfo?.sequence || ''
            }
          : undefined,
        genres: metadata.genres || [],
        publishedYear: metadata.publishedYear,
        publisher: metadata.publisher,
        language: metadata.language,
        explicit: metadata.explicit,
        asin: metadata.asin,
        isbn: metadata.isbn,
        progress: progressData.currentTime
          ? {
              currentTime: progressData.currentTime || 0,
              percentage: progressData.percentage || 0,
              isFinished: progressData.isFinished || false,
              lastPlayedAt: progress.lastPlayedAt,
            }
          : undefined,
        tracks,
      }
    } catch (error) {
      console.error('[Audiobookshelf] Parse detail error:', error, item)
      // Возвращаем минимальный объект при ошибке парсинга
      return {
        id: item?.id || 'unknown',
        libraryId: item?.libraryId || '',
        title: item?.media?.metadata?.title || 'Неизвестно',
        author: 'Неизвестный автор',
        duration: 0,
        genres: [],
        tracks: [],
      }
    }
  }
}

// Синглтон
export const audiobookshelfService = new AudiobookshelfService()

// Экспорт функции для получения экземпляра сервиса
export function getAudiobookshelfApi() {
  return audiobookshelfService
}

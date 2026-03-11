/**
 * Apple Music Search API (iTunes)
 *
 * https://performance-partners.apple.com/search-api
 *
 * Публичный API - не требует ключей
 * Rate Limit: 20 запросов/сек
 *
 * Поддержка локализации:
 * - entity=artist/album/song
 * - country=RU (Россия), US (США), и т.д.
 * - limit=количество (макс 200)
 * - term=поисковый запрос
 * - attribute=поле для поиска (artistTerm, albumTerm, songTerm)
 */

export interface iTunesResult {
  wrapperType: string
  kind: string
  artistId: number
  collectionId?: number
  trackId?: number
  artistName: string
  collectionName?: string
  trackName?: string
  collectionCensoredName?: string
  trackCensoredName?: string
  artistViewUrl?: string
  collectionViewUrl?: string
  trackViewUrl?: string
  previewUrl?: string
  artworkUrl30?: string
  artworkUrl60?: string
  artworkUrl100?: string
  collectionPrice?: number
  trackPrice?: number
  releaseDate?: string
  collectionExplicitness?: string
  trackExplicitness?: string
  discCount?: number
  discNumber?: number
  trackCount?: number
  trackNumber?: number
  trackTimeMillis?: number
  country?: string
  currency?: string
  primaryGenreName?: string
  isStreamable?: boolean
}

export interface iTunesArtist {
  artistId: number
  artistName: string
  artistLinkUrl: string
  primaryGenreName: string
  artworkUrl100?: string
}

export interface iTunesAlbum {
  collectionId: number
  collectionName: string
  artistName: string
  collectionCensoredName: string
  artistViewUrl: string
  collectionViewUrl: string
  artworkUrl60?: string
  artworkUrl100?: string
  releaseDate?: string
  primaryGenreName?: string
  trackCount?: number
  copyright?: string
}

// Коды стран для локализации
export const COUNTRY_CODES = {
  RU: 'RU', // Россия
  US: 'US', // США
  GB: 'GB', // Великобритания
  DE: 'DE', // Германия
  FR: 'FR', // Франция
  ES: 'ES', // Испания
  IT: 'IT', // Италия
  JP: 'JP', // Япония
  CN: 'CN', // Китай
  BR: 'BR', // Бразилия
  AU: 'AU', // Австралия
  CA: 'CA', // Канада
  IN: 'IN', // Индия
  MX: 'MX', // Мексика
  KR: 'KR', // Корея
} as const

export type CountryCode = typeof COUNTRY_CODES[keyof typeof COUNTRY_CODES]

// Словарь для перевода жанров
export const GENRE_TRANSLATIONS: Record<string, Record<string, string>> = {
  ru: {
    'Rock': 'Рок',
    'Pop': 'Поп',
    'Electronic': 'Электронная',
    'Hip-Hop/Rap': 'Хип-хоп/Рэп',
    'Jazz': 'Джаз',
    'Classical': 'Классика',
    'Metal': 'Метал',
    'Alternative': 'Альтернатива',
    'Country': 'Кантри',
    'R&B/Soul': 'R&B/Соул',
    'Reggae': 'Регги',
    'Folk': 'Фолк',
    'Blues': 'Блюз',
    'Soundtrack': 'Саундтрек',
    'World': 'Мировая',
    'New Age': 'Нью-эйдж',
    'Ambient': 'Эмбиент',
    'Dance': 'Танцевальная',
    'Indie': 'Инди',
    'Punk': 'Панк',
    'Latin': 'Латина',
    'Reggaeton': 'Реггетон',
    'K-Pop': 'K-Pop',
    'J-Pop': 'J-Pop',
    'Techno': 'Техно',
    'House': 'Хаус',
    'Trance': 'Транс',
    'Dubstep': 'Дабстеп',
    'Drum & Bass': 'Драм-н-бейс',
    'Trap': 'Трэп',
    'Acoustic': 'Акустика',
    'Singer/Songwriter': 'Автор-исполнитель',
    'Instrumental': 'Инструментальная',
    'Vocal': 'Вокальная',
    'Experimental': 'Экспериментальная',
    'Psychedelic': 'Психоделик',
    'Progressive': 'Прогрессив',
    'Hardcore': 'Хардкор',
    'Grunge': 'Гранж',
    'Britpop': 'Брит-поп',
    'Shoegaze': 'Шугейз',
    'Post-Punk': 'Пост-панк',
    'New Wave': 'Новая волна',
    'Hard Rock': 'Хард-рок',
    'Heavy Metal': 'Хэви-метал',
    'Death Metal': 'Дэт-метал',
    'Black Metal': 'Блэк-метал',
    'Nu Metal': 'Ню-метал',
    'Funk': 'Фанк',
    'Disco': 'Диско',
    'Euro-Techno': 'Евро-техно',
    'Eurodance': 'Евродэнс',
    'Synthpop': 'Синти-поп',
    'Chillout': 'Чиллаут',
    'Lo-Fi': 'Лоу-фай',
    'Meditation': 'Медитация',
    'Nature': 'Природа',
    'Relax': 'Релакс',
    'Sleep': 'Сон',
    'Workout': 'Тренировка',
    'Fitness': 'Фитнес',
    'Party': 'Вечеринка',
    'Wedding': 'Свадьба',
    'Christmas': 'Рождество',
    'Halloween': 'Хэллоуин',
    'Summer': 'Лето',
    'Winter': 'Зима',
    'Spring': 'Весна',
    'Autumn': 'Осень',
    'Love': 'Любовь',
    'Romance': 'Романтика',
    'Sad': 'Грустная',
    'Happy': 'Счастливая',
    'Energetic': 'Энергичная',
    'Calm': 'Спокойная',
    'Focus': 'Фокус',
    'Study': 'Учёба',
    'Work': 'Работа',
    'Travel': 'Путешествие',
    'Gaming': 'Игры',
    'Anime': 'Аниме',
    'Cartoon': 'Мультфильмы',
    'Kids': 'Детская',
    'Family': 'Семейная',
  },
}

/**
 * Перевести жанр на указанный язык
 */
export function translateGenre(genre: string, lang: string = 'ru'): string {
  if (!genre) return genre
  
  const translations = GENRE_TRANSLATIONS[lang]
  if (!translations) return genre
  
  // Пробуем точное совпадение
  if (translations[genre]) {
    return translations[genre]
  }
  
  // Пробуем частичное совпадение
  for (const [en, ru] of Object.entries(translations)) {
    if (genre.toLowerCase().includes(en.toLowerCase())) {
      return ru
    }
  }
  
  // Возвращаем оригинал если не найдено
  return genre
}

class AppleMusicService {
  private baseUrl: string = 'https://itunes.apple.com'
  private cache: Map<string, { data: any; expires: number }> = new Map()
  private readonly CACHE_TTL: number = 24 * 60 * 60 * 1000 // 24 часа
  private readonly RATE_LIMIT_DELAY: number = 50 // 20 запросов/сек
  private lastRequestTime: number = 0
  private country: CountryCode = 'RU' // Страна по умолчанию

  /**
   * Установить страну для локализации
   */
  setCountry(countryCode: CountryCode): void {
    this.country = countryCode
    console.log(`[AppleMusic] Country set to: ${countryCode}`)
  }

  /**
   * Получить текущую страну
   */
  getCountry(): CountryCode {
    return this.country
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
   * GET запрос к iTunes API
   */
  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    // Проверка кэша
    const cacheKey = `${endpoint}:${JSON.stringify(params)}:${this.country}`
    const cached = this.cache.get(cacheKey)

    if (cached && cached.expires > Date.now()) {
      console.log(`[AppleMusic] Cache hit: ${endpoint}`)
      return cached.data as T
    }

    await this.rateLimit()

    try {
      const url = new URL(`${this.baseUrl}${endpoint}`)

      // Добавляем страну для локализации
      url.searchParams.set('country', this.country)

      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })

      const urlString = url.toString()

      // Проверяем, работаем ли в Electron
      const win = window as any
      let response: Response

      if (win.api && win.api.fetchExternal) {
        // Используем Electron IPC для обхода CORS
        console.log('[AppleMusic] Using Electron fetch proxy')
        const data = await win.api.fetchExternal(urlString)
        
        // Проверяем, не raw ли это ответ
        if (data._isRaw) {
          console.warn('[AppleMusic] Got raw response, trying to parse...')
          try {
            const json = JSON.parse(data._raw)
            response = {
              ok: true,
              status: 200,
              json: async () => json,
            } as Response
          } catch (e) {
            console.error('[AppleMusic] Failed to parse raw response:', e)
            throw new Error('Failed to parse response')
          }
        } else {
          response = {
            ok: true,
            status: 200,
            json: async () => data,
          } as Response
        }
      } else {
        // Обычный fetch для веба
        response = await fetch(urlString)
      }

      if (!(response as any).ok) {
        // Очищаем кэш при ошибке
        this.cache.delete(cacheKey)
        console.error(`[AppleMusic] HTTP error ${(response as any).status}: ${endpoint}`)
        return null
      }

      const data = await (response as any).json()

      // Кэширование успешного ответа
      this.cache.set(cacheKey, {
        data,
        expires: Date.now() + this.CACHE_TTL,
      })

      return data as T
    } catch (error) {
      console.error(`[AppleMusic] Request failed: ${endpoint}`, error)
      return null
    }
  }

  /**
   * Поиск артиста по имени
   */
  async searchArtist(query: string, limit: number = 10): Promise<iTunesArtist[]> {
    const response = await this.request<any>('/search', {
      term: query,
      entity: 'artist',
      limit: limit.toString(),
    })

    if (!response?.results) {
      return []
    }

    return response.results.map((result: any) => ({
      artistId: result.artistId,
      artistName: result.artistName,
      artistLinkUrl: result.artistLinkUrl,
      primaryGenreName: result.primaryGenreName,
      artworkUrl100: result.artistLinkUrl,
    }))
  }

  /**
   * Поиск треков артиста
   */
  async searchTracks(artistName: string, limit: number = 50): Promise<iTunesResult[]> {
    const response = await this.request<any>('/search', {
      term: artistName,
      entity: 'song',
      limit: limit.toString(),
    })

    if (!response?.results) {
      return []
    }

    return response.results
      .filter((r: any) => r.kind === 'song')
      .map((result: any) => ({
        ...result,
        wrapperType: result.wrapperType,
        kind: result.kind,
        artistId: result.artistId,
        trackId: result.trackId,
        artistName: result.artistName,
        trackName: result.trackName,
        collectionName: result.collectionName,
        artworkUrl100: result.artworkUrl100,
        previewUrl: result.previewUrl,
        releaseDate: result.releaseDate,
        primaryGenreName: result.primaryGenreName,
        trackTimeMillis: result.trackTimeMillis,
      }))
  }

  /**
   * Поиск альбомов артиста
   */
  async searchAlbums(artistName: string, limit: number = 50): Promise<iTunesAlbum[]> {
    const response = await this.request<any>('/search', {
      term: artistName,
      entity: 'album',
      limit: limit.toString(),
    })

    if (!response?.results) {
      return []
    }

    return response.results
      .filter((r: any) => r.wrapperType === 'collection')
      .map((result: any) => ({
        collectionId: result.collectionId,
        collectionName: result.collectionName,
        artistName: result.artistName,
        collectionViewUrl: result.collectionViewUrl,
        artworkUrl100: result.artworkUrl100,
        releaseDate: result.releaseDate,
        primaryGenreName: result.primaryGenreName,
        trackCount: result.trackCount,
      }))
  }

  /**
   * Получить треки из альбома
   */
  async getAlbumTracks(collectionId: number): Promise<iTunesResult[]> {
    const response = await this.request<any>('/lookup', {
      id: collectionId.toString(),
      entity: 'song',
    })

    if (!response?.results) {
      return []
    }

    return response.results
      .filter((r: any) => r.kind === 'song')
      .map((result: any) => ({
        ...result,
        wrapperType: result.wrapperType,
        kind: result.kind,
        artistId: result.artistId,
        collectionId: result.collectionId,
        trackId: result.trackId,
        artistName: result.artistName,
        trackName: result.trackName,
        collectionName: result.collectionName,
        artworkUrl100: result.artworkUrl100,
        previewUrl: result.previewUrl,
        releaseDate: result.releaseDate,
        trackNumber: result.trackNumber,
        trackTimeMillis: result.trackTimeMillis,
      }))
  }

  /**
   * Получить новые релизы артиста (за последний год)
   */
  async getNewReleases(artistName: string): Promise<iTunesAlbum[]> {
    const albums = await this.searchAlbums(artistName, 100)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    return albums.filter(album => {
      if (!album.releaseDate) return false
      const releaseDate = new Date(album.releaseDate)
      return releaseDate >= oneYearAgo
    }).sort((a, b) => {
      // Сортировка по дате (новые сначала)
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      return dateB - dateA
    })
  }

  /**
   * Получить топ треки по жанру
   */
  async getTopTracksByGenre(genre: string, limit: number = 25): Promise<iTunesResult[]> {
    const response = await this.request<any>('/search', {
      term: genre,
      entity: 'song',
      attribute: 'genre',
      limit: limit.toString(),
    })

    if (!response?.results) {
      return []
    }

    return response.results.slice(0, limit)
  }

  /**
   * Очистка кэша
   */
  clearCache(): void {
    this.cache.clear()
    console.log('[AppleMusic] Cache cleared')
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
export const appleMusicService = new AppleMusicService()

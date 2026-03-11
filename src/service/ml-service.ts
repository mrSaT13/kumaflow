import {
  getStarredSongs,
  getArtistInfo,
  getRandomSongs,
  getSongsByGenre,
  getSimilarSongs,
  getTopSongs,
  type NavidromeSong,
  type NavidromeArtist,
} from '@/service/navidrome-api'
import { lastFmService } from '@/service/lastfm-api'
import { useExternalApiStore } from '@/store/external-api.store'

export interface MLPlaylist {
  id: string
  title: string
  description: string
  songs: NavidromeSong[]
  coverArt?: string
}

export interface MLRecommendation {
  songId: string
  score: number
  reason: string
}

/**
 * ML сервис для генерации персональных плейлистов
 */
class MLService {
  private userPreferences = {
    likedGenres: new Map<string, number>(),
    likedArtists: new Map<string, number>(),
    likedSongs: new Set<string>(),
    playHistory: new Map<string, number>(),
  }

  /**
   * Инициализация ML сервиса
   * Загружает лайкнутые треки и анализирует предпочтения
   */
  async initialize(): Promise<void> {
    console.log('Initializing ML service...')

    // Инициализация внешних API
    this.initializeExternalApis()

    // Загружаем лайкнутые треки
    const starredSongs = await getStarredSongs()

    // Анализируем предпочтения
    starredSongs.forEach(song => {
      this.userPreferences.likedSongs.add(song.id)

      // Увеличиваем вес жанра
      const currentGenreWeight = this.userPreferences.likedGenres.get(song.genre) || 0
      this.userPreferences.likedGenres.set(song.genre, currentGenreWeight + 1)

      // Увеличиваем вес артиста
      const currentArtistWeight = this.userPreferences.likedArtists.get(song.artistId) || 0
      this.userPreferences.likedArtists.set(song.artistId, currentArtistWeight + 1)
    })

    console.log('ML service initialized:', {
      likedSongs: this.userPreferences.likedSongs.size,
      likedGenres: this.userPreferences.likedGenres.size,
      likedArtists: this.userPreferences.likedArtists.size,
    })
  }

  /**
   * Инициализация внешних API (Last.fm, Fanart.tv)
   */
  private initializeExternalApis(): void {
    const state = useExternalApiStore.getState()
    state.initializeServices()
    console.log('[ML Service] External APIs initialized')
  }

  /**
   * Получить похожих артистов с fallback на Last.fm
   */
  private async getSimilarArtistsWithFallback(
    artistId: string,
    artistName: string
  ): Promise<Array<{ name: string; id?: string }>> {
    const similarArtists: Array<{ name: string; id?: string }> = []

    // 1. Пробуем получить из Navidrome
    try {
      const artistInfo = await getArtistInfo(artistId)
      if (artistInfo?.similarArtist && artistInfo.similarArtist.length > 0) {
        similarArtists.push(...artistInfo.similarArtist.map(a => ({ name: a.name, id: a.id })))
        console.log(`[ML Service] Got ${similarArtists.length} similar artists from Navidrome`)
        return similarArtists
      }
    } catch (error) {
      console.warn('[ML Service] Failed to get similar artists from Navidrome:', error)
    }

    // 2. Fallback: Last.fm
    const state = useExternalApiStore.getState()
    if (state.settings.lastFmEnabled && state.settings.lastFmApiKey) {
      try {
        const lastFmSimilar = await lastFmService.getSimilarArtists(artistName, 20)
        if (lastFmSimilar.length > 0) {
          similarArtists.push(...lastFmSimilar.map(a => ({ name: a.name })))
          console.log(`[ML Service] Got ${similarArtists.length} similar artists from Last.fm`)
          return similarArtists
        }
      } catch (error) {
        console.warn('[ML Service] Failed to get similar artists from Last.fm:', error)
      }
    }

    console.log('[ML Service] No similar artists found')
    return similarArtists
  }

  /**
   * Сгенерировать персональный микс на основе лайкнутых артистов
   */
  async generateDailyMix(mixNumber: number = 1): Promise<MLPlaylist> {
    const starredSongs = await getStarredSongs()
    
    if (starredSongs.length === 0) {
      // Если нет лайкнутых треков, возвращаем случайные
      const randomSongs = await getRandomSongs(25)
      return {
        id: `daily-mix-${mixNumber}`,
        title: `Микс дня ${mixNumber}`,
        description: 'Случайные треки из вашей библиотеки',
        songs: randomSongs,
      }
    }
    
    // Берём топ 5 жанров пользователя
    const topGenres = Array.from(this.userPreferences.likedGenres.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    
    const playlistSongs: NavidromeSong[] = []
    
    // Для каждого топ жанра берём треки
    for (const [genre, weight] of topGenres) {
      const songsByGenre = await getSongsByGenre(genre, 5)
      playlistSongs.push(...songsByGenre.slice(0, 5))
    }
    
    // Добавляем лайкнутые треки
    playlistSongs.push(...starredSongs.slice(0, 5))
    
    // Перемешиваем и ограничиваем до 25 треков
    const shuffled = playlistSongs.sort(() => Math.random() - 0.5).slice(0, 25)
    
    return {
      id: `daily-mix-${mixNumber}`,
      title: `Микс дня ${mixNumber}`,
      description: `Персонально на основе ваших ${this.userPreferences.likedSongs.size} лайкнутых треков`,
      songs: shuffled,
    }
  }

  /**
   * Сгенерировать плейлист похожих треков на основе артиста
   */
  async generateSimilarArtistPlaylist(artistId: string, artistName: string): Promise<MLPlaylist> {
    try {
      // Получаем похожих артистов с fallback на Last.fm
      const similarArtists = await this.getSimilarArtistsWithFallback(artistId, artistName)

      const playlistSongs: NavidromeSong[] = []

      // Для каждого похожего артиста берём топ треки
      if (similarArtists.length > 0) {
        for (const similarArtist of similarArtists.slice(0, 5)) {
          const topSongs = await getTopSongs(similarArtist.name, 5)
          playlistSongs.push(...topSongs)
        }
      }

      // Добавляем топ треки текущего артиста
      const artistTopSongs = await getTopSongs(artistName, 5)
      playlistSongs.push(...artistTopSongs)

      const shuffled = playlistSongs.sort(() => Math.random() - 0.5).slice(0, 25)

      return {
        id: `similar-to-${artistId}`,
        title: `Похоже на ${artistName}`,
        description: `Треки похожие на ${artistName}`,
        songs: shuffled,
      }
    } catch (error) {
      console.error('Failed to generate similar artist playlist:', error)
      // Возвращаем случайные треки при ошибке
      const randomSongs = await getRandomSongs(25)
      return {
        id: `similar-to-${artistId}`,
        title: `Похоже на ${artistName}`,
        description: 'Случайные треки',
        songs: randomSongs,
      }
    }
  }

  /**
   * Сгенерировать плейлист открытий (новые треки на основе предпочтений)
   */
  async generateDiscoverWeekly(): Promise<MLPlaylist> {
    const topGenres = Array.from(this.userPreferences.likedGenres.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    
    const playlistSongs: NavidromeSong[] = []
    
    // Берём треки из любимых жанров, но которые ещё не лайкнуты
    for (const [genre] of topGenres) {
      const songsByGenre = await getSongsByGenre(genre, 10)
      const newSongs = songsByGenre.filter(song => !this.userPreferences.likedSongs.has(song.id))
      playlistSongs.push(...newSongs.slice(0, 7))
    }
    
    const shuffled = playlistSongs.sort(() => Math.random() - 0.5).slice(0, 20)
    
    return {
      id: 'discover-weekly',
      title: 'Открытия недели',
      description: 'Новые треки на основе ваших предпочтений',
      songs: shuffled,
    }
  }

  /**
   * Сгенерировать плейлист трендов (часто прослушиваемое)
   */
  async generateTrendsPlaylist(): Promise<MLPlaylist> {
    // Получаем треки с наибольшим количеством прослушиваний
    const starredSongs = await getStarredSongs()
    
    // Сортируем по playCount
    const sorted = starredSongs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    
    return {
      id: 'trends',
      title: 'Тренды',
      description: 'Чаще всего прослушиваемое',
      songs: sorted.slice(0, 25),
    }
  }

  /**
   * Получить рекомендации для текущего пользователя
   */
  async getRecommendations(limit: number = 50): Promise<MLRecommendation[]> {
    const recommendations: MLRecommendation[] = []
    
    // Получаем случайные треки
    const randomSongs = await getRandomSongs(limit * 2)
    
    // Оцениваем каждый трек
    for (const song of randomSongs) {
      let score = 0
      const reasons: string[] = []
      
      // Жанр совпадает с любимым
      if (this.userPreferences.likedGenres.has(song.genre)) {
        score += 50
        reasons.push(`Любимый жанр: ${song.genre}`)
      }
      
      // Артист нравится
      if (this.userPreferences.likedArtists.has(song.artistId)) {
        score += 100
        reasons.push('Любимый артист')
      }
      
      // Трек уже лайкнут
      if (this.userPreferences.likedSongs.has(song.id)) {
        score += 200
        reasons.push('Лайкнутый трек')
      }
      
      if (score > 0) {
        recommendations.push({
          songId: song.id,
          score,
          reason: reasons.join(', '),
        })
      }
    }
    
    // Сортируем по score и возвращаем топ N
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

// Экспорт синглтона
export const mlService = new MLService()

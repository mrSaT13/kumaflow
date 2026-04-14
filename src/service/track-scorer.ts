/**
 * Track Scorer — Scoring формула P(like|t) + Dynamic Diversity
 * 
 * Реализует умный скоринг треков для "Моей Волны" v1.6.0
 * 
 * Формула:
 * P(like|t) = w_audio × audio_similarity(t)
 *           + w_genre × genre_match(t)
 *           + w_artist × artist_match(t)
 *           + w_behavior × behavior_score(t)
 *           + w_novelty × novelty(t) × genre_weight × popularity_factor
 *           + context_bonus(t)
 *           + diversity_penalty(t)
 *           + time_history_bonus(t)
 * 
 * Adaptive Weights:
 * - Новички (<50 лайков): {audio:0.20, genre:0.30, artist:0.10, behavior:0.10, collab:0.25, novelty:0.05}
 * - Опытные (50+ лайков): {audio:0.40, genre:0.20, artist:0.10, behavior:0.20, collab:0.05, novelty:0.05}
 * 
 * Diversity Penalty:
 * - -0.05 за второго артиста
 * - -0.10 за третьего артиста
 * - -0.03 за второй жанр
 * - -0.07 за третий жанр
 * 
 * Context Bonus:
 * - Работа (9-18): +0.1 к energy 0.3-0.6
 * - Спорт (6-9): +0.1 к BPM>110, +0.1 к energy>0.7
 * - Отдых (18-22): +0.1 к mood RELAXED/CALM
 * - Ночь (22-6): +0.1 к energy<0.3
 */

import { behaviorTracker } from './behavior-tracker'
import { timeAwareHistory } from './time-aware-history'
import { analyzeTrack } from './vibe-similarity'
import { useMLStore } from '@/store/ml.store'
import type { ISong } from '@/types/responses/song'

export interface TrackScoreResult {
  song: ISong
  totalScore: number
  audioScore: number
  genreScore: number
  artistScore: number
  behaviorScore: number
  noveltyScore: number
  contextBonus: number
  diversityPenalty: number
  timeHistoryBonus: number
  realtimeAdjustment: number  // 🆕 Real-time feedback
  rank: number  // позиция после сортировки
  recommendationReason?: string  // 🆕 Причина рекомендации
}

export interface ScoringWeights {
  audio: number
  genre: number
  artist: number
  behavior: number
  collab: number
  novelty: number
}

export interface ScoringContext {
  /** Текущее время (час 0-23) */
  currentHour: number
  /** Выбранная активность */
  activity?: 'wakeup' | 'commute' | 'work' | 'workout' | 'sleep' | ''
  /** Выбранное настроение */
  mood?: 'energetic' | 'happy' | 'calm' | 'sad' | ''
  /** Уже добавленные в плейлист артисты (для diversity penalty) */
  usedArtists: Map<string, number>  // artistId → count
  /** Уже добавленные в плейлист жанры (для diversity penalty) */
  usedGenres: Map<string, number>  // genre → count
  /** Seed-треки для audio similarity */
  seedTracks: ISong[]
}

// Веса для новичков и опытных пользователей
const BEGINNER_WEIGHTS: ScoringWeights = {
  audio: 0.20,
  genre: 0.30,
  artist: 0.10,
  behavior: 0.10,
  collab: 0.25,
  novelty: 0.05,
}

const EXPERIENCED_WEIGHTS: ScoringWeights = {
  audio: 0.40,
  genre: 0.20,
  artist: 0.10,
  behavior: 0.20,
  collab: 0.05,
  novelty: 0.05,
}

const NOVELTY_GENRE_MULTIPLIER: Record<string, number> = {
  'Pop': 1.2,
  'Rock': 1.0,
  'Electronic': 1.1,
  'Hip-Hop': 1.15,
  'Jazz': 0.8,
  'Classical': 0.7,
  'default': 1.0,
}

// 🆕 Genre-Aware Energy Curves: как энергия должна меняться в плейлисте
export interface GenreEnergyCurve {
  type: 'smooth' | 'spiky' | 'crescendo' | 'wave' | 'flat'
  variance: number  // допустимое отклонение энергии (0.0-0.5)
  maxDelta: number  // макс изменение между треками
}

export const GENRE_ENERGY_CURVES: Record<string, GenreEnergyCurve> = {
  'Jazz': { type: 'smooth', variance: 0.15, maxDelta: 0.1 },
  'Classical': { type: 'crescendo', variance: 0.2, maxDelta: 0.12 },
  'Electronic': { type: 'spiky', variance: 0.35, maxDelta: 0.25 },
  'EDM': { type: 'spiky', variance: 0.4, maxDelta: 0.3 },
  'Rock': { type: 'wave', variance: 0.25, maxDelta: 0.2 },
  'Metal': { type: 'spiky', variance: 0.3, maxDelta: 0.25 },
  'Pop': { type: 'smooth', variance: 0.2, maxDelta: 0.15 },
  'Hip-Hop': { type: 'wave', variance: 0.25, maxDelta: 0.18 },
  'R&B': { type: 'smooth', variance: 0.18, maxDelta: 0.12 },
  'Ambient': { type: 'flat', variance: 0.08, maxDelta: 0.05 },
  'default': { type: 'smooth', variance: 0.2, maxDelta: 0.15 },
}

// 🆕 Genre Bridges: какие жанры соединяют два других жанра
export const GENRE_BRIDGES: Record<string, Record<string, string[]>> = {
  'Rock': {
    'Pop': ['Indie', 'Indie Rock', 'Alternative', 'Indie Pop'],
    'Hip-Hop': ['Rap Rock', 'Nu Metal', 'Alternative Hip-Hop'],
    'Electronic': ['Synth Rock', 'Electro Rock', 'New Wave'],
  },
  'Pop': {
    'Rock': ['Indie', 'Indie Pop', 'Alternative', 'Pop Rock'],
    'Hip-Hop': ['Pop Rap', 'Trap Pop', 'R&B'],
    'Electronic': ['Synth Pop', 'Dance Pop', 'Electropop'],
  },
  'Hip-Hop': {
    'Rock': ['Rap Rock', 'Nu Metal', 'Alternative Hip-Hop'],
    'Pop': ['Pop Rap', 'Trap Pop', 'R&B'],
    'Electronic': ['Trap', 'Hip-House', 'Electro'],
  },
  'Electronic': {
    'Rock': ['Synth Rock', 'Electro Rock', 'New Wave'],
    'Pop': ['Synth Pop', 'Dance Pop', 'Electropop'],
    'Hip-Hop': ['Trap', 'Hip-House', 'Electro'],
  },
  'Jazz': {
    'Rock': ['Jazz Fusion', 'Jazz Rock', 'Funk'],
    'Pop': ['Vocal Jazz', 'Jazz Pop', 'Swing'],
    'Hip-Hop': ['Jazz Rap', 'Lo-Fi Hip-Hop', 'Trip-Hop'],
  },
}

export class TrackScorer {
  /** Real-time feedback: корректировки весов во время сессии */
  private realtimeAdjustments: Map<string, number> = new Map()  // trackId → adjustment
  private realtimeSeedWeights: Map<string, number> = new Map()  // seedTrackId → weight adjustment

  /**
   * Применить real-time feedback: лайк трека
   * Увеличивает веса seed-треков похожих на этот
   */
  applyLikeFeedback(likedSong: ISong, seedTracks: ISong[]): void {
    const likedFeatures = analyzeTrack(likedSong)
    
    // Для каждого seed-трека рассчитываем сходство с лайкнутым
    for (const seed of seedTracks) {
      const seedFeatures = analyzeTrack(seed)
      
      // Считаем similarity
      const energyDiff = Math.abs(likedFeatures.energy - seedFeatures.energy)
      const valenceDiff = Math.abs(likedFeatures.valence - seedFeatures.valence)
      const similarity = 1 - (energyDiff * 0.5 + valenceDiff * 0.5)
      
      // Если seed похож на лайкнутый → увеличиваем его вес
      if (similarity > 0.7) {
        const currentWeight = this.realtimeSeedWeights.get(seed.id) || 0
        this.realtimeSeedWeights.set(seed.id, currentWeight + 0.2)
        console.log(`[Realtime Feedback] 🔼 Seed ${seed.id} weight +0.2 (similarity: ${similarity.toFixed(2)})`)
      }
    }
  }

  /**
   * Применить real-time feedback: пропуск трека
   * Уменьшает веса seed-треков похожих на пропущенный
   */
  applySkipFeedback(skippedSong: ISong, seedTracks: ISong[]): void {
    const skippedFeatures = analyzeTrack(skippedSong)
    
    // Для каждого seed-трека рассчитываем сходство с пропущенным
    for (const seed of seedTracks) {
      const seedFeatures = analyzeTrack(seed)
      
      // Считаем similarity
      const energyDiff = Math.abs(skippedFeatures.energy - seedFeatures.energy)
      const valenceDiff = Math.abs(skippedFeatures.valence - seedFeatures.valence)
      const similarity = 1 - (energyDiff * 0.5 + valenceDiff * 0.5)
      
      // Если seed похож на пропущенный → уменьшаем его вес
      if (similarity > 0.7) {
        const currentWeight = this.realtimeSeedWeights.get(seed.id) || 0
        this.realtimeSeedWeights.set(seed.id, currentWeight - 0.3)
        console.log(`[Realtime Feedback] 🔽 Seed ${seed.id} weight -0.3 (similarity: ${similarity.toFixed(2)})`)
      }
    }
  }

  /**
   * Применить корректировку к конкретному треку
   */
  applyTrackAdjustment(trackId: string, adjustment: number): void {
    const current = this.realtimeAdjustments.get(trackId) || 0
    this.realtimeAdjustments.set(trackId, current + adjustment)
  }

  /**
   * Получить real-time корректировку для трека
   */
  getRealtimeAdjustment(trackId: string): number {
    return this.realtimeAdjustments.get(trackId) || 0
  }

  /**
   * Очистить все real-time корректировки (новая сессия)
   */
  clearRealtimeFeedback(): void {
    this.realtimeAdjustments.clear()
    this.realtimeSeedWeights.clear()
    console.log('[Realtime Feedback] Cleared all adjustments')
  }

  /**
   * Определить тип пользователя (новичок/опытный)
   */
  private getUserType(): 'beginner' | 'experienced' {
    const mlState = useMLStore.getState()
    const likedCount = mlState.profile.likedSongs.length
    return likedCount >= 50 ? 'experienced' : 'beginner'
  }

  /**
   * Получить веса для текущего пользователя
   */
  getWeights(): ScoringWeights {
    const userType = this.getUserType()
    return userType === 'beginner' ? BEGINNER_WEIGHTS : EXPERIENCED_WEIGHTS
  }

  /**
   * Рассчитать audio similarity трека к seed-трекам
   */
  private calculateAudioSimilarity(song: ISong, seedTracks: ISong[]): number {
    if (seedTracks.length === 0) return 0.5

    const songFeatures = analyzeTrack(song)
    
    // Среднее сходство ко всем seed-трекам
    let totalSimilarity = 0
    let count = 0

    for (const seed of seedTracks) {
      const seedFeatures = analyzeTrack(seed)
      
      // Euclidean distance по основным признакам
      const energyDiff = Math.abs(songFeatures.energy - seedFeatures.energy)
      const valenceDiff = Math.abs(songFeatures.valence - seedFeatures.valence)
      const danceabilityDiff = Math.abs(songFeatures.danceability - seedFeatures.danceability)
      const acousticnessDiff = Math.abs(songFeatures.acousticness - seedFeatures.acousticness)
      
      // Нормализуем в [0, 1] где 1 = максимально похоже
      const similarity = 1 - (
        energyDiff * 0.35 +
        valenceDiff * 0.25 +
        danceabilityDiff * 0.20 +
        acousticnessDiff * 0.20
      )
      
      totalSimilarity += similarity
      count++
    }

    return count > 0 ? totalSimilarity / count : 0.5
  }

  /**
   * Рассчитать genre match трека
   */
  private calculateGenreMatch(song: ISong): number {
    const mlState = useMLStore.getState()
    const preferredGenres = mlState.profile.preferredGenres
    
    if (!song.genre || Object.keys(preferredGenres).length === 0) return 0.5

    const genreWeight = preferredGenres[song.genre] || 0
    const maxWeight = Math.max(...Object.values(preferredGenres), 1)
    
    // Нормализуем в [0, 1]
    return Math.min(1, genreWeight / maxWeight)
  }

  /**
   * Рассчитать artist match трека
   */
  private calculateArtistMatch(song: ISong): number {
    const mlState = useMLStore.getState()
    const preferredArtists = mlState.profile.preferredArtists
    
    if (!song.artistId || Object.keys(preferredArtists).length === 0) return 0.3

    const artistWeight = preferredArtists[song.artistId] || 0
    const maxWeight = Math.max(...Object.values(preferredArtists), 1)
    
    // Нормализуем в [0, 1]
    return Math.min(1, artistWeight / maxWeight)
  }

  /**
   * Рассчитать behavior score трека
   */
  private async calculateBehaviorScore(songId: string): Promise<number> {
    const trackScore = await behaviorTracker.getTrackScore(songId)
    
    if (!trackScore) return 0.5

    // Нормализуем score в [0, 1]
    // score может быть от -10 до +50 примерно
    const normalizedScore = Math.max(0, Math.min(1, (trackScore.score + 10) / 60))
    
    return normalizedScore
  }

  /**
   * Рассчитать novelty score
   */
  private calculateNoveltyScore(song: ISong): number {
    const mlState = useMLStore.getState()
    const rating = mlState.ratings[song.id]

    if (!rating) return 1.0  // Новый трек = максимальная новизна

    const playCount = rating.playCount || 0
    const replayCount = rating.replayCount || 0

    // Формула: novelty = 1 / (1 + playCount + replayCount * 2)
    const baseNovelty = 1 / (1 + playCount + replayCount * 2)

    // Умножаем на genre weight
    const genreMultiplier = NOVELTY_GENRE_MULTIPLIER[song.genre] || NOVELTY_GENRE_MULTIPLIER.default

    return Math.min(1, baseNovelty * genreMultiplier)
  }

  /**
   * Рассчитать novelty bonus (для discovery)
   * 
   * <7 дней: +0.1
   * 7-30 дней: +0.05
   * Зависит от жанра: популярные ×1.2, нишевые ×0.8
   */
  private calculateNoveltyBonus(song: ISong): number {
    const mlState = useMLStore.getState()
    const rating = mlState.ratings[song.id]

    // Если трек вообще не слушал — максимальный бонус
    if (!rating) return 0.15

    const lastPlayedDate = rating.lastPlayedDate
    if (!lastPlayedDate) return 0.1

    // Считаем дни с последнего воспроизведения
    const today = new Date()
    const lastPlayed = new Date(lastPlayedDate)
    const daysSince = Math.floor((today.getTime() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24))

    let baseBonus = 0
    if (daysSince < 7) {
      baseBonus = 0.1
    } else if (daysSince < 30) {
      baseBonus = 0.05
    } else {
      baseBonus = 0.02  // Старые треки — маленький бонус
    }

    // Множитель жанра (популярные жанры получают больше)
    const genreMultiplier = NOVELTY_GENRE_MULTIPLIER[song.genre] || NOVELTY_GENRE_MULTIPLIER.default

    return Math.min(0.2, baseBonus * genreMultiplier)
  }

  /**
   * Рассчитать context bonus
   */
  private calculateContextBonus(song: ISong, context: ScoringContext): number {
    const { currentHour, activity, mood } = context
    const features = analyzeTrack(song)
    
    let bonus = 0

    // Определяем контекст времени
    const isWorkHours = currentHour >= 9 && currentHour < 18
    const isSportHours = currentHour >= 6 && currentHour < 9
    const isRestHours = currentHour >= 18 && currentHour < 22
    const isNightHours = currentHour >= 22 || currentHour < 6

    // Бонусы по активности
    if (activity === 'work' || isWorkHours) {
      if (features.energy >= 0.3 && features.energy <= 0.6) {
        bonus += 0.1
      }
    }

    if (activity === 'workout' || isSportHours) {
      if (features.bpm > 110) bonus += 0.1
      if (features.energy > 0.7) bonus += 0.1
    }

    if (mood === 'calm' || activity === 'sleep' || isRestHours) {
      if (features.valence < 0.6) {  // RELAXED/CALM треки
        bonus += 0.1
      }
    }

    if (isNightHours) {
      if (features.energy < 0.3) bonus += 0.1
    }

    return bonus
  }

  /**
   * Рассчитать diversity penalty
   */
  private calculateDiversityPenalty(song: ISong, context: ScoringContext): number {
    let penalty = 0

    // Penalty за артистов
    if (song.artistId && context.usedArtists.has(song.artistId)) {
      const artistCount = context.usedArtists.get(song.artistId)!
      if (artistCount === 1) {
        penalty += 0.05  // Второй трек того же артиста
      } else if (artistCount >= 2) {
        penalty += 0.10  // Третий и более трек того же артиста
      }
    }

    // Penalty за жанры
    if (song.genre && context.usedGenres.has(song.genre)) {
      const genreCount = context.usedGenres.get(song.genre)!
      if (genreCount === 1) {
        penalty += 0.03  // Второй трек того же жанра
      } else if (genreCount >= 2) {
        penalty += 0.07  // Третий и более трек того же жанра
      }
    }

    return penalty
  }

  /**
   * 🆕 Genre Bridge Bonus: бонус трекам из жанров-мостов между топ жанрами пользователя
   */
  private calculateGenreBridgeBonus(song: ISong): number {
    const mlState = useMLStore.getState()
    const preferredGenres = Object.entries(mlState.profile.preferredGenres)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)  // Топ 3 жанра
      .map(([genre]) => genre)

    if (preferredGenres.length < 2) return 0

    const songGenre = song.genre || ''
    if (!songGenre) return 0

    // Проверяем является ли этот жанр мостом между любыми двумя топ жанрами
    for (let i = 0; i < preferredGenres.length; i++) {
      for (let j = i + 1; j < preferredGenres.length; j++) {
        const genreA = preferredGenres[i]
        const genreB = preferredGenres[j]

        const bridges = GENRE_BRIDGES[genreA]?.[genreB] || []
        if (bridges.some(bridge => songGenre.toLowerCase().includes(bridge.toLowerCase()))) {
          console.log(`[Genre Bridge] 🌉 "${songGenre}" bridges ${genreA} ↔ ${genreB} → +0.12 bonus`)
          return 0.12
        }
      }
    }

    return 0
  }

  /**
   * 🆕 Anniversary Boost: бонус трекам которые слушали год/месяц назад в эту дату
   */
  private calculateAnniversaryBonus(song: ISong): number {
    const mlState = useMLStore.getState()
    const rating = mlState.ratings[song.id]

    if (!rating || !rating.lastPlayedDate) return 0

    const today = new Date()
    const lastPlayed = new Date(rating.lastPlayedDate)

    // Проверяем совпадение дня и месяца
    const isSameDay = today.getDate() === lastPlayed.getDate() &&
                      today.getMonth() === lastPlayed.getMonth()
    const isSameMonth = today.getMonth() === lastPlayed.getMonth()

    if (isSameDay) {
      // Ровно год/несколько лет назад
      const yearsAgo = today.getFullYear() - lastPlayed.getFullYear()
      if (yearsAgo >= 1) {
        console.log(`[Anniversary] 🎂 "${song.title}" played ${yearsAgo} year(s) ago today! +0.2 bonus`)
        return 0.2
      }
    }

    if (isSameMonth) {
      // В этом месяце N лет назад
      const yearsAgo = today.getFullYear() - lastPlayed.getFullYear()
      if (yearsAgo >= 1) {
        return 0.1
      }
    }

    return 0
  }

  /**
   * 🆕 Genre-Aware Energy Curve: применить жанровую сортировку к плейлисту
   * Пересортировывает треки чтобы энергия соответствовала жанровой кривой
   */
  applyGenreCurveSorting(songs: ISong[]): ISong[] {
    if (songs.length < 5) return songs

    // Определяем доминирующий жанр плейлиста
    const genreCount: Record<string, number> = {}
    songs.forEach(song => {
      if (song.genre) {
        genreCount[song.genre] = (genreCount[song.genre] || 0) + 1
      }
    })

    const dominantGenre = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'default'

    const curve = GENRE_ENERGY_CURVES[dominantGenre] || GENRE_ENERGY_CURVES['default']

    console.log(`[Genre Curve] 🎵 Applying ${curve.type} curve for ${dominantGenre} (variance: ${curve.variance})`)

    // Сортируем треки по энергии
    const tracksWithEnergy = songs.map(song => ({
      song,
      energy: analyzeTrack(song).energy,
    }))

    // Применяем жанровую кривую
    switch (curve.type) {
      case 'smooth':
        // Плавная сортировка: небольшие изменения энергии
        return tracksWithEnergy
          .sort((a, b) => {
            const aSmooth = Math.abs(a.energy - 0.5)
            const bSmooth = Math.abs(b.energy - 0.5)
            return aSmooth - bSmooth  // Ближе к средней энергии сначала
          })
          .map(t => t.song)

      case 'crescendo':
        // Нарастание: от тихих к громким
        return tracksWithEnergy
          .sort((a, b) => a.energy - b.energy)
          .map(t => t.song)

      case 'spiky':
        // Чередование высокой и низкой энергии
        const sorted = tracksWithEnergy.sort((a, b) => a.energy - b.energy)
        const low = sorted.slice(0, Math.floor(sorted.length / 2))
        const high = sorted.slice(Math.floor(sorted.length / 2))
        const result: ISong[] = []
        for (let i = 0; i < Math.max(low.length, high.length); i++) {
          if (i % 2 === 0 && high[i]) result.push(high[i].song)
          else if (low[i]) result.push(low[i].song)
          else if (high[i]) result.push(high[i].song)
        }
        return result

      case 'wave':
        // Волна: чередование пиков
        const byEnergy = tracksWithEnergy.sort((a, b) => a.energy - b.energy)
        const third = Math.floor(byEnergy.length / 3)
        return [
          ...byEnergy.slice(0, third).reverse().map(t => t.song),     // Высокая → Средняя
          ...byEnergy.slice(third, third * 2).map(t => t.song),       // Средняя
          ...byEnergy.slice(third * 2).map(t => t.song),              // Низкая → Средняя
        ]

      case 'flat':
        // Плоская: минимальные изменения, сортируем близко к средней
        const avg = tracksWithEnergy.reduce((sum, t) => sum + t.energy, 0) / tracksWithEnergy.length
        return tracksWithEnergy
          .sort((a, b) => Math.abs(a.energy - avg) - Math.abs(b.energy - avg))
          .map(t => t.song)

      default:
        return songs
    }
  }

  /**
   * 🆕 Genre-Aware Energy Curve: штраф за отклонение от жанровой кривой
   */
  private calculateGenreCurvePenalty(song: ISong, index: number, totalTracks: number): number {
    const genre = song.genre || 'default'
    const curve = GENRE_ENERGY_CURVES[genre] || GENRE_ENERGY_CURVES['default']
    
    const features = analyzeTrack(song)
    const energy = features.energy

    // Рассчитываем целевую энергию для этой позиции в зависимости от типа кривой
    let targetEnergy: number
    
    const position = index / totalTracks  // 0.0 - 1.0
    
    switch (curve.type) {
      case 'smooth':
        // Плавное изменение: линейная интерполяция
        targetEnergy = 0.5 + 0.1 * Math.sin(position * Math.PI * 2)
        break
      case 'spiky':
        // Резкие пики: случайно меняем энергию
        targetEnergy = 0.5 + 0.3 * Math.sin(position * Math.PI * 4)
        break
      case 'crescendo':
        // Нарастание: от низкой к высокой
        targetEnergy = 0.3 + 0.5 * position
        break
      case 'wave':
        // Волна: несколько пиков
        targetEnergy = 0.5 + 0.25 * Math.sin(position * Math.PI * 3)
        break
      case 'flat':
        // Плоская: минимальные изменения
        targetEnergy = 0.5
        break
      default:
        targetEnergy = 0.5
    }

    // Штраф за отклонение от целевой энергии
    const delta = Math.abs(energy - targetEnergy)
    const penalty = Math.min(curve.maxDelta * 2, delta * 0.5)

    if (penalty > 0.05) {
      console.log(`[Genre Curve] ${genre} (${curve.type}): track energy ${energy.toFixed(2)} vs target ${targetEnergy.toFixed(2)} → penalty ${penalty.toFixed(2)}`)
    }

    return penalty
  }

  /**
   * Рассчитать time history bonus
   */
  private calculateTimeHistoryBonus(songId: string): number {
    const timeScore = timeAwareHistory.getTimeBonus(songId)
    
    // Нормализуем timeBonus в [0, 0.2]
    // timeBonus может быть от 0 до ~30
    return Math.min(0.2, timeScore.timeBonus / 150)
  }

  /**
   * Рассчитать полный score для трека
   */
  async scoreTrack(
    song: ISong,
    context: ScoringContext
  ): Promise<TrackScoreResult> {
    const weights = this.getWeights()

    // Рассчитываем компоненты
    const audioScore = this.calculateAudioSimilarity(song, context.seedTracks)
    const genreScore = this.calculateGenreMatch(song)
    const artistScore = this.calculateArtistMatch(song)
    const behaviorScore = await this.calculateBehaviorScore(song.id)
    const noveltyScore = this.calculateNoveltyScore(song)
    const noveltyBonus = this.calculateNoveltyBonus(song)  // НОВЫЙ БОНУС
    const contextBonus = this.calculateContextBonus(song, context)
    const diversityPenalty = this.calculateDiversityPenalty(song, context)
    const timeHistoryBonus = this.calculateTimeHistoryBonus(song.id)
    const anniversaryBonus = this.calculateAnniversaryBonus(song)  // 🆕 Anniversary Boost
    const genreBridgeBonus = this.calculateGenreBridgeBonus(song)  // 🆕 Genre Bridge

    // === REAL-TIME FEEDBACK ===
    const realtimeAdjustment = this.getRealtimeAdjustment(song.id)

    // Формула P(like|t)
    const totalScore =
      weights.audio * audioScore +
      weights.genre * genreScore +
      weights.artist * artistScore +
      weights.behavior * behaviorScore +
      weights.novelty * noveltyScore +
      noveltyBonus +  // НОВЫЙ БОНУС
      contextBonus -
      diversityPenalty +
      timeHistoryBonus +
      anniversaryBonus +  // 🆕 ANNIVERSARY BOOST
      genreBridgeBonus +  // 🆕 GENRE BRIDGE BOOST
      realtimeAdjustment  // REAL-TIME FEEDBACK

    // 🆕 Generate recommendation reason
    const recommendationReason = this.generateRecommendationReason(
      song, audioScore, genreScore, artistScore, behaviorScore, noveltyScore, contextBonus, timeHistoryBonus
    )

    return {
      song,
      totalScore: Math.max(0, Math.min(1, totalScore)),  // Clamp [0, 1]
      audioScore,
      genreScore,
      artistScore,
      behaviorScore,
      noveltyScore,
      contextBonus,
      diversityPenalty,
      timeHistoryBonus,
      realtimeAdjustment,
      rank: 0,  // Будет установлен после сортировки
      recommendationReason,  // 🆕 Причина рекомендации
    }
  }

  /**
   * 🆕 Генерация пояснения почему трек рекомендован
   */
  private generateRecommendationReason(
    song: ISong,
    audioScore: number,
    genreScore: number,
    artistScore: number,
    behaviorScore: number,
    noveltyScore: number,
    contextBonus: number,
    timeHistoryBonus: number
  ): string {
    // Определяем доминирующий фактор
    const factors = [
      { name: 'audio', value: audioScore },
      { name: 'genre', value: genreScore },
      { name: 'artist', value: artistScore },
      { name: 'behavior', value: behaviorScore },
      { name: 'context', value: contextBonus },
      { name: 'time', value: timeHistoryBonus },
    ]

    factors.sort((a, b) => b.value - a.value)
    const topFactor = factors[0]

    if (topFactor.name === 'audio' && topFactor.value > 0.7) {
      return 'Похоже на треки, которые вам нравятся'
    }
    if (topFactor.name === 'genre' && topFactor.value > 0.6) {
      return `Из вашего любимого жанра${song.genre ? ': ' + song.genre : ''}`
    }
    if (topFactor.name === 'artist' && topFactor.value > 0.6) {
      return `От вашего артиста: ${song.artist || 'Unknown'}`
    }
    if (topFactor.name === 'behavior' && topFactor.value > 0.6) {
      return 'Вы часто слушаете похожие треки'
    }
    if (topFactor.name === 'context' && topFactor.value > 0.05) {
      const hour = new Date().getHours()
      if (hour >= 6 && hour < 12) return 'Отлично подходит для утра'
      if (hour >= 12 && hour < 18) return 'Идеально для рабочего дня'
      if (hour >= 18 && hour < 22) return 'Подходит для вечернего настроения'
      return 'Отличный выбор для ночи'
    }
    if (topFactor.name === 'time' && topFactor.value > 0.05) {
      return 'Вы часто слушаете это в такое время'
    }
    if (noveltyScore > 0.8) {
      return 'Новинка для вас — стоит попробовать!'
    }

    return 'Рекомендовано для вас'
  }

  /**
   * Скорировать и отранжировать список треков
   * Возвращает отсортированный по totalScore список
   */
  async scoreAndRankTracks(
    candidates: ISong[],
    context: ScoringContext,
    limit?: number
  ): Promise<TrackScoreResult[]> {
    const scored = await Promise.all(
      candidates.map(song => this.scoreTrack(song, context))
    )

    // Сортируем по totalScore (по убыванию)
    scored.sort((a, b) => b.totalScore - a.totalScore)

    // Присваиваем rank
    scored.forEach((result, index) => {
      result.rank = index + 1
    })

    // Лимитируем если нужно
    return limit ? scored.slice(0, limit) : scored
  }

  /**
   * Обновить context с учётом добавленного трека
   */
  updateContextAfterAdding(context: ScoringContext, song: ISong): void {
    if (song.artistId) {
      context.usedArtists.set(song.artistId, (context.usedArtists.get(song.artistId) || 0) + 1)
    }
    if (song.genre) {
      context.usedGenres.set(song.genre, (context.usedGenres.get(song.genre) || 0) + 1)
    }
  }

  /**
   * Получить статистику скоринга
   */
  getScoringStats(scores: TrackScoreResult[]): {
    avgScore: number
    maxScore: number
    minScore: number
    avgAudioScore: number
    avgGenreScore: number
    avgDiversityPenalty: number
  } {
    if (scores.length === 0) {
      return {
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        avgAudioScore: 0,
        avgGenreScore: 0,
        avgDiversityPenalty: 0,
      }
    }

    const sum = scores.reduce((acc, s) => acc + s.totalScore, 0)
    const audioSum = scores.reduce((acc, s) => acc + s.audioScore, 0)
    const genreSum = scores.reduce((acc, s) => acc + s.genreScore, 0)
    const penaltySum = scores.reduce((acc, s) => acc + s.diversityPenalty, 0)

    return {
      avgScore: sum / scores.length,
      maxScore: Math.max(...scores.map(s => s.totalScore)),
      minScore: Math.min(...scores.map(s => s.totalScore)),
      avgAudioScore: audioSum / scores.length,
      avgGenreScore: genreSum / scores.length,
      avgDiversityPenalty: penaltySum / scores.length,
    }
  }
}

// Экспортируем синглтон
export const trackScorer = new TrackScorer()

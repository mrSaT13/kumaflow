/**
 * Auto Recommender - Автоматические рекомендации
 * 
 * Генерирует плейлисты на основе поведенческих сигналов
 * Аналог Spotify Discover Weekly / Daily Mixes
 * 
 * Алгоритм:
 * 1. Получаем пользовательский вектор предпочтений
 * 2. Ищем похожие треки в библиотеке
 * 3. Фильтруем (бан-лист, недавно сыгранные)
 * 4. Ранжируем по сходству + разнообразие
 * 5. Orchestrator для плавных переходов
 */

import { behaviorTracker } from './behavior-tracker'
import { getSongsByGenre, getRandomSongs, getTopSongs } from './subsonic-api'
import { orchestratePlaylist } from './playlist-orchestrator'
import type { ISong } from '@/types/responses/song'

export interface AutoPlaylistOptions {
  diversity?: number  // 0-1, насколько разнообразным делать (0 = одинаково, 1 = максимально разнообразно)
  recencyBoost?: boolean  // Поднимать новые треки
  excludePlayedRecently?: boolean  // Не повторять треки за последние 7 дней
  limit?: number  // Количество треков
}

export interface GeneratedPlaylist {
  id: string
  type: 'daily-mix' | 'discover-weekly' | 'time-mix' | 'mood-mix' | 'activity-mix' | 'genre-mix' | 'artist-mix'
  name: string
  description: string
  songs: ISong[]
  gradient: string
  createdAt: number
  reason: string  // Почему сгенерирован
}

export class AutoRecommender {
  /**
   * Генерация плейлиста на основе поведения
   */
  async generatePlaylist(options: AutoPlaylistOptions = {}): Promise<ISong[]> {
    const opts: Required<AutoPlaylistOptions> = {
      diversity: 0.3,
      recencyBoost: true,
      excludePlayedRecently: true,
      limit: 20,
      ...options,
    }

    // 1. Получаем пользовательский "вайб-вектор"
    const userVibe = await behaviorTracker.getUserVibeVector(50)
    
    if (!userVibe || userVibe.topGenres.length === 0) {
      // Fallback: популярные треки в библиотеке
      console.log('[AutoRecommender] No behavior data, using fallback')
      return await this.getFallbackPlaylist(opts.limit)
    }

    console.log('[AutoRecommender] User vibe:', userVibe)

    // 2. Получаем кандидатов из библиотеки
    let candidates: ISong[] = []
    
    // Берём треки из топ жанров пользователя
    for (const genre of userVibe.topGenres.slice(0, 3)) {
      try {
        const genreSongs = await getSongsByGenre(genre, opts.limit * 2)
        candidates.push(...genreSongs)
      } catch (error) {
        console.warn(`[AutoRecommender] Failed to get genre ${genre}:`, error)
      }
    }

    // Добавляем случайные треки для разнообразия
    try {
      const randomSongs = await getRandomSongs(opts.limit * 2)
      candidates.push(...randomSongs)
    } catch (error) {
      console.warn('[AutoRecommender] Failed to get random songs:', error)
    }

    // 3. Фильтруем: бан-лист, недавно сыгранные
    if (opts.excludePlayedRecently) {
      const recentlyPlayed = await behaviorTracker.getRecentlyPlayed(7)
      candidates = candidates.filter(t => !recentlyPlayed.includes(t.id))
    }

    // TODO: Фильтр бан-листа артистов
    // candidates = candidates.filter(t => !isBannedArtist(t.artistId))

    // 4. Считаем сходство с пользовательским вектором
    const scored = candidates.map(track => {
      let score = this.calculateTrackScore(track, userVibe)

      // Буст за новизну (если трек редко слушали)
      if (opts.recencyBoost && (track.playCount || 0) < 3) {
        score *= 1.15
      }

      return { ...track, score }
    })

    // 5. Сортируем и берём топ
    let selected = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit * 2)

    // 6. Применяем diversity penalty (не подряд один артист/жанр)
    if (opts.diversity > 0) {
      selected = this.diversify(selected, opts.diversity)
    }

    // 7. Финальная сортировка через Orchestrator (плавные переходы)
    const orchestrated = orchestratePlaylist(selected.slice(0, opts.limit), {
      startWith: 'energetic',
      endWith: 'calm',
    })

    return orchestrated
  }

  /**
   * Генерация Daily Mix (как в Spotify)
   */
  async generateDailyMix(mixNumber: number = 1): Promise<GeneratedPlaylist> {
    const userVibe = await behaviorTracker.getUserVibeVector(100)
    
    // 5 вариантов Daily Mix
    const mixConfigs = [
      { name: 'Микс дня #1', focus: 'topGenres', gradient: 'from-orange-400 to-yellow-500' },
      { name: 'Микс дня #2', focus: 'topArtists', gradient: 'from-blue-400 to-cyan-500' },
      { name: 'Микс дня #3', focus: 'newReleases', gradient: 'from-purple-400 to-pink-500' },
      { name: 'Микс дня #4', focus: 'discovery', gradient: 'from-green-400 to-teal-500' },
      { name: 'Микс дня #5', focus: 'favorites', gradient: 'from-red-400 to-rose-500' },
    ]

    const config = mixConfigs[(mixNumber - 1) % mixConfigs.length]
    
    console.log(`[AutoRecommender] Generating ${config.name}...`)

    const songs = await this.generatePlaylist({
      limit: 25,
      diversity: 0.4,
      recencyBoost: true,
      excludePlayedRecently: true,
    })

    return {
      id: `daily-mix-${mixNumber}`,
      type: 'daily-mix',
      name: config.name,
      description: `На основе твоих предпочтений • ${songs.length} треков`,
      songs,
      gradient: config.gradient,
      createdAt: Date.now(),
      reason: config.focus,
    }
  }

  /**
   * Генерация Time Mix (по времени суток)
   */
  async generateTimeMix(): Promise<GeneratedPlaylist> {
    const timeContext = behaviorTracker.getTimeContext()
    
    const timeConfigs = {
      morning: {
        name: '☀️ Утренний старт',
        description: 'Постепенное пробуждение от спокойного инди-попа к лёгкому поп-року',
        gradient: 'from-orange-400 to-yellow-500',
        bpmRange: [80, 110],
        energyRange: [0.3, 0.7],
      },
      day: {
        name: '🌤 Дневная энергия',
        description: 'Поддержание продуктивности: поп, рок, хип-хоп с умеренной энергией',
        gradient: 'from-blue-400 to-cyan-500',
        bpmRange: [100, 125],
        energyRange: [0.6, 0.8],
      },
      evening: {
        name: '🌆 Вечерний релакс',
        description: 'Расслабление после рабочего дня: R&B, chill-house, соул',
        gradient: 'from-purple-400 to-pink-500',
        bpmRange: [90, 115],
        energyRange: [0.4, 0.6],
      },
      night: {
        name: '🌃 Ночные огни',
        description: 'Спокойная музыка для ночи: ambient, lo-fi, downtempo',
        gradient: 'from-indigo-600 to-blue-800',
        bpmRange: [60, 90],
        energyRange: [0.1, 0.4],
      },
    }

    const config = timeConfigs[timeContext]
    
    console.log(`[AutoRecommender] Generating ${config.name}...`)

    const songs = await this.generatePlaylist({
      limit: 25,
      diversity: 0.3,
      recencyBoost: false,
      excludePlayedRecently: false,
    })

    return {
      id: `time-mix-${timeContext}`,
      type: 'time-mix',
      name: config.name,
      description: config.description,
      songs,
      gradient: config.gradient,
      createdAt: Date.now(),
      reason: `Время суток: ${timeContext}`,
    }
  }

  /**
   * Генерация Mood Mix (по настроению)
   */
  async generateMoodMix(mood: 'happy' | 'sad' | 'energetic' | 'calm'): Promise<GeneratedPlaylist> {
    const moodConfigs = {
      happy: {
        name: '😊 Счастливое настроение',
        description: 'Мажорные тональности, uplifting вокал, прогрессии I-V-vi-IV',
        gradient: 'from-yellow-400 to-orange-500',
      },
      sad: {
        name: '😢 Грустное настроение',
        description: 'Минорные тональности, минималистичная аранжировка, эмоциональный вокал',
        gradient: 'from-blue-600 to-indigo-800',
      },
      energetic: {
        name: '⚡ Энергетическая вспышка',
        description: 'EDM, pop-rock, hip-hop. Сильные биты, drop'ы',
        gradient: 'from-red-500 to-orange-600',
      },
      calm: {
        name: '🧘 Полное спокойствие',
        description: 'Ambient, lo-fi, downtempo. Отсутствие резких переходов',
        gradient: 'from-teal-500 to-cyan-600',
      },
    }

    const config = moodConfigs[mood]
    
    console.log(`[AutoRecommender] Generating ${config.name}...`)

    const songs = await this.generatePlaylist({
      limit: 25,
      diversity: 0.3,
      recencyBoost: false,
      excludePlayedRecently: false,
    })

    return {
      id: `mood-mix-${mood}`,
      type: 'mood-mix',
      name: config.name,
      description: config.description,
      songs,
      gradient: config.gradient,
      createdAt: Date.now(),
      reason: `Настроение: ${mood}`,
    }
  }

  /**
   * Приватные методы
   */

  private calculateTrackScore(track: ISong, userVibe: any): number {
    let score = 0.5  // Базовый score

    // Буст за жанр
    if (userVibe.topGenres?.includes(track.genre)) {
      score += 0.2
    }

    // Буст за артиста (если пользователь часто слушает этого артиста)
    // TODO: Проверить через behaviorTracker.getTrackScore

    // Буст за BPM (если есть предпочтения)
    if (userVibe.avgBpm) {
      const bpmDiff = Math.abs((track.bpm || 0) - userVibe.avgBpm)
      if (bpmDiff < 20) score += 0.1
    }

    // Буст за энергию
    if (userVibe.avgEnergy) {
      const energyDiff = Math.abs((parseFloat(track.energy as any) || 0.5) - userVibe.avgEnergy)
      if (energyDiff < 0.2) score += 0.1
    }

    // Небольшой рандом для разнообразия
    score += (Math.random() * 0.1 - 0.05)

    return score
  }

  private diversify(tracks: Array<ISong & { score: number }>, strength: number): Array<ISong & { score: number }> {
    const result: Array<ISong & { score: number }> = []
    const used = new Set<string>()

    // Жадный алгоритм: чередуем артистов/жанры
    while (result.length < tracks.length * 0.6) {
      for (const track of tracks) {
        if (used.has(track.id)) continue

        // Штраф если последний трек того же артиста/жанра
        const last = result[result.length - 1]
        if (last && strength > 0.5) {
          if (last.artist === track.artist) continue
          if (last.genre === track.genre && Math.random() < strength) continue
        }

        result.push(track)
        used.add(track.id)
      }
    }

    // Добавляем остаток
    for (const track of tracks) {
      if (!used.has(track.id)) result.push(track)
    }

    return result
  }

  private async getFallbackPlaylist(limit: number): Promise<ISong[]> {
    try {
      return await getRandomSongs(limit)
    } catch {
      return []
    }
  }
}

// Экспортируем единственный экземпляр
export const autoRecommender = new AutoRecommender()

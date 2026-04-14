/**
 * Auto Playlist Manager — Создаёт автоматические плейлисты
 * 
 * Запускается:
 * - При старте приложения
 * - Раз в 24 часа
 * - После каждых 10 прослушиваний
 */

import { UserPatternDetector, type UserSignal, type ListeningPattern } from './user-pattern-detector'
import { PlaylistCurator, type CuratedPattern } from './playlist-curator'
import { subsonic } from '@/service/subsonic'
import { getRandomSongs, getSongsByGenre } from '@/service/subsonic-api'
import { useMLStore } from '@/store/ml.store'
import type { ISong } from '@/types/responses/song'

export interface AutoPlaylist {
  id: string
  name: string
  description: string
  emoji: string
  tracks: ISong[]
  lastUpdated: number
  autoRefresh: boolean
  confidence: number
}

export class AutoPlaylistManager {
  private patternDetector: UserPatternDetector
  private curator: PlaylistCurator
  private llmEnabled: boolean
  private llmConfig: { enabled: boolean; url: string; model: string; apiKey?: string }

  constructor(llmConfig: { enabled: boolean; url: string; model: string; apiKey?: string }) {
    this.llmConfig = llmConfig
    this.llmEnabled = llmConfig.enabled
    this.patternDetector = new UserPatternDetector()
    this.curator = new PlaylistCurator(llmConfig)

    console.log('[AutoPlaylist] Initialized', { llmEnabled: this.llmEnabled })
  }
  
  /**
   * Главная функция — создаёт авто-плейлисты
   */
  async refreshAutoPlaylists(): Promise<AutoPlaylist[]> {
    console.log('[AutoPlaylist] Starting refresh...')
    
    try {
      // 1. Собираем сигналы за последние 30 дней
      const signals = await this.getUserSignals(30)
      console.log('[AutoPlaylist] Collected', signals.length, 'signals')
      
      if (signals.length === 0) {
        console.log('[AutoPlaylist] No signals found')
        return []
      }
      
      // 2. Находим паттерны
      const patterns = await this.patternDetector.detectPatterns(signals)
      console.log('[AutoPlaylist] Found', patterns.length, 'patterns')
      
      if (patterns.length === 0) {
        console.log('[AutoPlaylist] No patterns detected')
        return []
      }
      
      // 3. Для каждого паттерна создаём плейлист
      const playlists: AutoPlaylist[] = []
      
      for (const pattern of patterns) {
        console.log('[AutoPlaylist] Processing pattern:', pattern.id)
        
        // 3a. LLM придумывает название и описание
        const enriched = this.llmEnabled
          ? await this.curator.enrichPattern(pattern)
          : this.getFallbackPattern(pattern)
        
        console.log('[AutoPlaylist] Enriched:', enriched.name, enriched.emoji)
        
        // 3b. Подбираем треки под аудио-профиль
        const tracks = await this.findTracksByProfile(enriched, 20)
        console.log('[AutoPlaylist] Found', tracks.length, 'tracks')
        
        if (tracks.length > 0) {
          playlists.push({
            id: enriched.id,
            name: enriched.name,
            description: enriched.description,
            emoji: enriched.emoji,
            tracks,
            lastUpdated: Date.now(),
            autoRefresh: true,
            confidence: enriched.confidence,
          })
        }
      }
      
      console.log('[AutoPlaylist] Created', playlists.length, 'playlists')
      return playlists
    } catch (error) {
      console.error('[AutoPlaylist] Error:', error)
      return []
    }
  }
  
  /**
   * Собираем сигналы из истории прослушиваний ML Store
   */
  private async getUserSignals(days: number): Promise<UserSignal[]> {
    const state = useMLStore.getState()
    const ratings = Object.entries(state.ratings)  // [songId, rating][]
    
    console.log('[AutoPlaylist] Got', ratings.length, 'ratings from ML Store')
    
    // Фильтруем по времени (только за последние N дней)
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    const signals: UserSignal[] = []
    
    for (const [songId, rating] of ratings) {
      // Пропускаем если нет lastPlayed
      if (!rating.lastPlayed) continue
      
      const lastPlayedTime = new Date(rating.lastPlayed).getTime()
      
      // Пропускаем если старее чем days дней
      if (lastPlayedTime < cutoffDate) continue
      
      // Создаём сигнал — ЧИТАЕМ AUDIO FEATURES ИЗ rating
      signals.push({
        timestamp: lastPlayedTime,
        songId: songId,
        duration: 180,  // TODO: реальная длительность
        skipped: (rating.skipCount || 0) > 0,
        liked: rating.like === true,
        replayCount: rating.replayCount || 0,
        audioFeatures: {
          bpm: rating.bpm,  // ← Это должно работать!
          energy: rating.energy,
          valence: rating.valence,
          genre: rating.songInfo?.genre,
        },
      })
    }
    
    // Логируем сколько треков имеют audioFeatures
    const withFeatures = signals.filter(s => s.audioFeatures?.bpm || s.audioFeatures?.energy).length
    console.log('[AutoPlaylist] Filtered to', signals.length, 'signals from last', days, 'days')
    console.log('[AutoPlaylist] Signals with audioFeatures:', withFeatures, `(${(withFeatures/signals.length*100).toFixed(1)}%)`)
    
    return signals
  }
  
  /**
   * Подбираем треки под аудио-профиль — ВЕКТОРНЫЙ ПОИСК + РАЗНООБРАЗИЕ
   */
  private async findTracksByProfile(pattern: CuratedPattern, limit: number): Promise<ISong[]> {
    console.log('[AutoPlaylist] Finding tracks for profile:', {
      name: pattern.name,
      bpm: pattern.avgBpm,
      energy: pattern.avgEnergy,
      valence: pattern.avgValence,
      genres: pattern.topGenres,
    })
    
    const trackScores: Map<string, { track: ISong; score: number }> = new Map()
    const artistCounts: Map<string, number> = new Map()  // Считаем треки от каждого артиста
    
    // 1. Получаем кандидатов по жанрам
    if (pattern.topGenres && pattern.topGenres.length > 0) {
      for (const genre of pattern.topGenres) {
        try {
          const genreTracks = await getSongsByGenre(genre, 50)
          console.log('[AutoPlaylist] Genre', genre, '→', genreTracks.length, 'tracks')
          
          // Скорим каждый трек по соответствию профилю
          for (const track of genreTracks) {
            const score = this.calculateTrackScore(track, pattern)
            if (score > 0.3) {  // СНИЗИЛИ порог
              trackScores.set(track.id, { track, score })
            }
          }
        } catch (error) {
          console.error('[AutoPlaylist] Genre search failed:', genre, error)
        }
      }
    }
    
    // 2. Если мало — доберём случайных и тоже скорим
    if (trackScores.size < limit * 2) {
      try {
        const random = await getRandomSongs(200)
        for (const track of random) {
          if (!trackScores.has(track.id)) {
            const score = this.calculateTrackScore(track, pattern)
            if (score > 0.2) {  // ЕЩЁ ниже порог для случайных
              trackScores.set(track.id, { track, score })
            }
          }
        }
      } catch (error) {
        console.error('[AutoPlaylist] Random search failed:', error)
      }
    }
    
    // 3. Сортируем по score
    let sorted = Array.from(trackScores.values())
      .sort((a, b) => b.score - a.score)
    
    console.log('[AutoPlaylist] Total candidates:', sorted.length)
    console.log('[AutoPlaylist] Top 10 scores:', sorted.slice(0, 10).map(t => `${t.track.artist} - ${t.track.title}: ${t.score.toFixed(2)}`))
    
    // 4. Отбираем с учётом разнообразия (не больше 2 треков от артиста)
    const finalTracks: ISong[] = []
    
    for (const { track, score } of sorted) {
      if (finalTracks.length >= limit) break
      
      const artistCount = artistCounts.get(track.artist) || 0
      if (artistCount >= 2) {
        console.log('[AutoPlaylist] Skip', track.artist, '- already has', artistCount, 'tracks')
        continue
      }
      
      finalTracks.push(track)
      artistCounts.set(track.artist, artistCount + 1)
      console.log('[AutoPlaylist] ✅ Selected:', track.artist, '-', track.title, `(score: ${score.toFixed(2)})`)
    }
    
    console.log('[AutoPlaylist] Final playlist:', finalTracks.length, 'tracks,', artistCounts.size, 'unique artists')
    
    return finalTracks
  }
  
  /**
   * Рассчитываем score соответствия трека профилю
   * Векторная близость по аудио-признакам
   */
  private calculateTrackScore(track: ISong, pattern: CuratedPattern): number {
    let score = 0
    let weights = 0
    
    // BPM (вес 30%)
    if (pattern.avgBpm && track.bpm) {
      const bpmDiff = Math.abs(track.bpm - pattern.avgBpm)
      const bpmScore = Math.max(0, 1 - (bpmDiff / 60))  // ±60 BPM = 0
      score += bpmScore * 0.3
      weights += 0.3
    }
    
    // Energy (вес 30%)
    if (pattern.avgEnergy !== undefined && track.energy !== undefined) {
      const energyDiff = Math.abs(track.energy - pattern.avgEnergy)
      const energyScore = Math.max(0, 1 - (energyDiff / 0.5))  // ±0.5 = 0
      score += energyScore * 0.3
      weights += 0.3
    }
    
    // Valence (вес 20%)
    if (pattern.avgValence !== undefined && track.valence !== undefined) {
      const valenceDiff = Math.abs(track.valence - pattern.avgValence)
      const valenceScore = Math.max(0, 1 - (valenceDiff / 0.5))
      score += valenceScore * 0.2
      weights += 0.2
    }
    
    // Genre (вес 20%)
    if (pattern.topGenres && pattern.topGenres.length > 0 && track.genre) {
      const genreMatch = pattern.topGenres.some(g => 
        track.genre?.toLowerCase().includes(g.toLowerCase())
      )
      if (genreMatch) {
        score += 0.2
        weights += 0.2
      }
    }
    
    // Нормализуем score (0-1)
    return weights > 0 ? score / weights : 0
  }
  
  /**
   * Fallback если LLM не настроен
   */
  private getFallbackPattern(pattern: ListeningPattern): CuratedPattern {
    const timeNames: Record<string, string> = {
      morning: 'Утренний вайб',
      day: 'Дневной поток',
      evening: 'Вечерний chill',
      night: 'Ночная волна',
    }
    
    const emojis: Record<string, string> = {
      morning: '☀️',
      day: '🌤️',
      evening: '🌆',
      night: '🌙',
    }
    
    return {
      ...pattern,
      name: timeNames[pattern.timeOfDay || 'day'] || 'Микс дня',
      description: `${pattern.topGenres?.join(', ') || 'Смесь жанров'} • ${pattern.playCount} треков`,
      emoji: emojis[pattern.timeOfDay || 'day'] || '🎵',
    }
  }
}

/**
 * Singleton для использования в приложении
 */
let autoPlaylistManager: AutoPlaylistManager | null = null

export function getAutoPlaylistManager(
  llmConfig: { enabled: boolean; url: string; model: string; apiKey?: string }
): AutoPlaylistManager {
  if (!autoPlaylistManager) {
    autoPlaylistManager = new AutoPlaylistManager(llmConfig)
  }
  return autoPlaylistManager
}

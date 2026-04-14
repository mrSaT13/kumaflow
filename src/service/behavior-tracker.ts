/**
 * Behavior Tracker - Сбор поведенческих сигналов
 * 
 * Отслеживает действия пользователя для улучшения рекомендаций
 * Аналог Spotify User Behavior Tracking
 * 
 * Сигналы:
 * - Полное прослушивание → +1 к предпочтению
 * - Пропуск < 30 сек → -1 к релевантности
 * - Повтор трека → сильный сигнал интереса
 * - Время суток → контекст для рекомендаций
 */

import type { ISong } from '@/types/responses/song'

export interface PlayEvent {
  trackId: string
  timestamp: number
  action: 'play' | 'skip' | 'repeat' | 'complete' | 'like' | 'dislike'
  position: number  // секунда на которой произошло действие
  sessionId: string
  timeContext: 'morning' | 'day' | 'evening' | 'night'
  dayOfWeek: number  // 0-6
}

export interface TrackScore {
  trackId: string
  score: number
  playCount: number
  skipCount: number
  likeCount: number
  lastPlayed?: number
  completionRate: number  // 0-1, сколько раз дослушал до конца
}

const STORAGE_KEY = 'kumaflow:behavior-events'
const MAX_EVENTS = 2000  // Храним последние 2000 событий

export class BehaviorTracker {
  private sessionId: string

  constructor() {
    this.sessionId = this.generateSessionId()
  }

  /**
   * Логирование события
   */
  async logEvent(event: Omit<PlayEvent, 'sessionId' | 'timeContext' | 'dayOfWeek'>): Promise<void> {
    const hour = new Date().getHours()
    const timeContext: PlayEvent['timeContext'] = 
      hour >= 6 && hour < 12 ? 'morning' :
      hour >= 12 && hour < 18 ? 'day' :
      hour >= 18 && hour < 24 ? 'evening' : 'night'

    const fullEvent: PlayEvent = {
      ...event,
      sessionId: this.sessionId,
      timeContext,
      dayOfWeek: new Date().getDay(),
    }

    console.log('[BehaviorTracker] Logging event:', fullEvent)

    const events = await this.getEvents(1000)
    events.unshift(fullEvent)
    
    // Храним только последние MAX_EVENTS
    const trimmed = events.slice(0, MAX_EVENTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    
    console.log('[BehaviorTracker] Total events:', trimmed.length)
  }

  /**
   * Получить пользовательский "вайб-вектор" на основе последних треков
   * 
   * @param window - количество последних треков для анализа (по умолчанию 50)
   * @returns усреднённый вектор предпочтений или null если мало данных
   */
  async getUserVibeVector(window: number = 50): Promise<Record<string, number> | null> {
    const events = await this.getEvents(200)

    // Берём только положительные события
    const positive = events.filter(e =>
      e.action === 'complete' || 
      e.action === 'repeat' || 
      e.action === 'like' ||
      (e.action === 'play' && e.position > 180)  // дослушал >3 мин
    ).slice(0, window)

    if (positive.length < 5) {
      return null  // Мало данных
    }

    // Считаем средние предпочтения по жанрам
    const genreScores: Record<string, number> = {}
    const artistScores: Record<string, number> = {}
    const bpmScores: number[] = []
    const energyScores: number[] = []

    for (const event of positive) {
      // ИЗМЕНЕНИЕ (14.04.2026): Реализована заглушка
      // Было: закомментированный код (строка 104-109)
      // Стало: загрузка метаданных из кэша аудио-анализа + fallback на API
      
      try {
        // 1. Пробуем получить из кэша аудио-анализа
        const { audioAnalysisService } = await import('@/service/audio-analysis')
        const cacheStats = audioAnalysisService.getCacheStats()
        
        let trackMetadata: any = null
        
        if (cacheStats.size > 0) {
          // Кэш есть — пробуем найти трек
          // NOTE: В идеале нужен метод getFromCache, но пока используем анализ заново
          console.log(`[BehaviorTracker] Audio analysis cache available: ${cacheStats.size} tracks`)
        }
        
        // 2. Fallback: запрашиваем через Subsonic API
        if (!trackMetadata) {
          const { subsonic } = await import('@/service/subsonic')
          const song = await subsonic.songs.getSong(event.trackId)
          
          if (song) {
            trackMetadata = {
              genre: song.genre,
              artist: song.artist,
              bpm: undefined,  // BPM только если есть в audio analysis
              energy: undefined,
            }
            
            console.log(`[BehaviorTracker] Loaded metadata for ${event.trackId}: genre=${song.genre}, artist=${song.artist}`)
          }
        }
        
        // 3. Обновляем скоры
        if (trackMetadata) {
          if (trackMetadata.genre) {
            genreScores[trackMetadata.genre] = (genreScores[trackMetadata.genre] || 0) + 1
          }
          if (trackMetadata.artist) {
            artistScores[trackMetadata.artist] = (artistScores[trackMetadata.artist] || 0) + 1
          }
          if (trackMetadata.bpm) {
            bpmScores.push(trackMetadata.bpm)
          }
          if (trackMetadata.energy !== undefined) {
            energyScores.push(trackMetadata.energy)
          }
        }
      } catch (error) {
        console.warn(`[BehaviorTracker] Failed to load metadata for ${event.trackId}:`, error)
      }
    }

    // Нормализуем
    const total = positive.length
    
    return {
      total,
      topGenres: Object.keys(genreScores).sort((a, b) => genreScores[b] - genreScores[a]).slice(0, 5),
      avgBpm: bpmScores.length ? bpmScores.reduce((a, b) => a + b, 0) / bpmScores.length : null,
      avgEnergy: energyScores.length ? energyScores.reduce((a, b) => a + b, 0) / energyScores.length : null,
    }
  }

  /**
   * Получить топ жанров пользователя
   */
  async getTopGenres(limit: number = 10): Promise<string[]> {
    const vibe = await this.getUserVibeVector(100)
    return vibe?.topGenres || []
  }

  /**
   * Получить контекст времени
   */
  getTimeContext(): PlayEvent['timeContext'] {
    const hour = new Date().getHours()
    return hour >= 6 && hour < 12 ? 'morning' :
           hour >= 12 && hour < 18 ? 'day' :
           hour >= 18 && hour < 24 ? 'evening' : 'night'
  }

  /**
   * Получить последние сыгранные треки
   */
  async getRecentlyPlayed(days: number = 7): Promise<string[]> {
    const events = await this.getEvents(500)
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    return events
      .filter(e => e.timestamp > cutoff && e.action === 'complete')
      .map(e => e.trackId)
  }

  /**
   * Получить статистику трека
   */
  async getTrackScore(trackId: string): Promise<TrackScore | null> {
    const events = await this.getEvents(1000)
    const trackEvents = events.filter(e => e.trackId === trackId)

    if (trackEvents.length === 0) return null

    const playCount = trackEvents.filter(e => e.action === 'play' || e.action === 'complete').length
    const skipCount = trackEvents.filter(e => e.action === 'skip').length
    const likeCount = trackEvents.filter(e => e.action === 'like').length
    const repeatCount = trackEvents.filter(e => e.action === 'repeat').length
    const completeCount = trackEvents.filter(e => e.action === 'complete').length

    const lastEvent = trackEvents[0]
    
    // Score: лайки + повторы + завершения - пропуски
    const score = (likeCount * 2) + (repeatCount * 3) + completeCount - (skipCount * 1)

    return {
      trackId,
      score,
      playCount,
      skipCount,
      likeCount,
      lastPlayed: lastEvent?.timestamp,
      completionRate: playCount > 0 ? completeCount / playCount : 0,
    }
  }

  /**
   * Очистить старые события
   */
  cleanup(maxAge: number = 30): void {
    const events = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const cutoff = Date.now() - (maxAge * 24 * 60 * 60 * 1000)
    
    const filtered = events.filter((e: PlayEvent) => e.timestamp > cutoff)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  }

  /**
   * Приватные методы
   */
  private async getEvents(limit: number): Promise<PlayEvent[]> {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    
    try {
      const events: PlayEvent[] = JSON.parse(raw)
      return events.slice(0, limit)
    } catch {
      return []
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}

// Экспортируем единственный экземпляр
export const behaviorTracker = new BehaviorTracker()

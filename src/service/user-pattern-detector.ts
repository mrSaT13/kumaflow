/**
 * User Pattern Detector — Анализирует историю и находит паттерны слушания
 * 
 * Группирует по:
 * - Время суток (утро/день/вечер/ночь)
 * - День недели (будни/выходные)
 * - Аудио-профиль (BPM, Energy, Valence)
 */

export interface UserSignal {
  timestamp: number
  songId: string
  duration: number  // сколько слушал (сек)
  skipped: boolean
  liked: boolean
  replayCount: number
  audioFeatures?: {
    bpm?: number
    energy?: number
    valence?: number
    genre?: string
  }
}

export interface ListeningPattern {
  id: string
  name: string  // заполнит LLM
  description: string  // заполнит LLM
  emoji: string  // заполнит LLM
  
  // Критерии активации
  timeOfDay?: 'morning' | 'day' | 'evening' | 'night'
  daysOfWeek?: number[]  // 0-6
  minSessionDuration?: number  // минут
  
  // Аудио-профиль
  avgBpm?: number
  avgEnergy?: number
  avgValence?: number
  topGenres?: string[]
  
  // Статистика
  confidence: number  // насколько уверен паттерн (0-1)
  lastTriggered?: number
  playCount: number
  trackIds: string[]
}

interface Cluster {
  timeOfDay: 'morning' | 'day' | 'evening' | 'night'
  daysOfWeek: number[]
  tracks: UserSignal[]
  sessionCount: number
}

export class UserPatternDetector {
  private signals: UserSignal[] = []
  
  /**
   * Анализируем историю и находим кластеры
   */
  async detectPatterns(signals: UserSignal[]): Promise<ListeningPattern[]> {
    this.signals = signals
    console.log('[PatternDetector] Analyzing', signals.length, 'signals')
    
    const patterns: ListeningPattern[] = []
    
    // 1. Группируем по времени суток + день недели
    const clusters = this.clusterByContext(signals)
    console.log('[PatternDetector] Found', clusters.length, 'clusters')
    
    for (const cluster of clusters) {
      // 2. Вычисляем аудио-профиль каждого кластера
      const audioProfile = this.computeAudioProfile(cluster.tracks)
      
      console.log('[PatternDetector] Cluster:', cluster.timeOfDay, {
        tracks: cluster.tracks.length,
        sessions: cluster.sessionCount,
        audioProfile,
      })
      
      // 3. Снизили пороги для создания паттерна
      if (cluster.tracks.length >= 5 && cluster.sessionCount >= 2) {
        const pattern: ListeningPattern = {
          id: this.generateId(cluster.timeOfDay),
          name: '',  // заполнит LLM
          description: '',  // заполнит LLM
          emoji: '',  // заполнит LLM
          timeOfDay: cluster.timeOfDay,
          daysOfWeek: cluster.daysOfWeek,
          avgBpm: audioProfile.bpm,
          avgEnergy: audioProfile.energy,
          avgValence: audioProfile.valence,
          topGenres: audioProfile.genres,
          confidence: this.calculateConfidence(cluster),
          playCount: cluster.tracks.length,
          trackIds: cluster.tracks.map(t => t.songId),
        }
        
        patterns.push(pattern)
        console.log('[PatternDetector] ✅ Created pattern:', pattern.id, 'confidence:', pattern.confidence)
      } else {
        console.log('[PatternDetector] ❌ Cluster too small:', cluster.timeOfDay, cluster.tracks.length, 'tracks,', cluster.sessionCount, 'sessions')
      }
    }
    
    return patterns
  }
  
  /**
   * Группируем сигналы по контексту
   */
  private clusterByContext(signals: UserSignal[]): Cluster[] {
    const clusters: Map<string, Cluster> = new Map()
    
    for (const signal of signals) {
      // Пропускаем скипнутые
      if (signal.skipped) continue
      
      const date = new Date(signal.timestamp)
      const timeOfDay = this.getTimeOfDay(date)
      const dayOfWeek = date.getDay()
      
      const key = `${timeOfDay}-${dayOfWeek >= 1 && dayOfWeek <= 5 ? 'weekday' : 'weekend'}`
      
      if (!clusters.has(key)) {
        clusters.set(key, {
          timeOfDay,
          daysOfWeek: [],
          tracks: [],
          sessionCount: 0,
        })
      }
      
      const cluster = clusters.get(key)!
      cluster.tracks.push(signal)
      
      if (!cluster.daysOfWeek.includes(dayOfWeek)) {
        cluster.daysOfWeek.push(dayOfWeek)
      }
    }
    
    // Считаем количество сессий (группируем по дням)
    for (const cluster of clusters.values()) {
      const days = new Set(cluster.tracks.map(t => new Date(t.timestamp).getDate()))
      cluster.sessionCount = days.size
    }
    
    return Array.from(clusters.values())
  }
  
  /**
   * Вычисляем аудио-профиль кластера
   */
  private computeAudioProfile(tracks: UserSignal[]) {
    const bpmValues: number[] = []
    const energyValues: number[] = []
    const valenceValues: number[] = []
    const genreCounts: Map<string, number> = new Map()
    
    for (const track of tracks) {
      if (track.audioFeatures) {
        if (track.audioFeatures.bpm) bpmValues.push(track.audioFeatures.bpm)
        if (track.audioFeatures.energy) energyValues.push(track.audioFeatures.energy)
        if (track.audioFeatures.valence) valenceValues.push(track.audioFeatures.valence)
        if (track.audioFeatures.genre) {
          genreCounts.set(track.audioFeatures.genre, (genreCounts.get(track.audioFeatures.genre) || 0) + 1)
        }
      }
    }
    
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined
    
    // Топ-3 жанра
    const topGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre)
    
    console.log('[PatternDetector] Audio profile:', {
      bpm: avg(bpmValues)?.toFixed(0),
      energy: avg(energyValues)?.toFixed(2),
      valence: avg(valenceValues)?.toFixed(2),
      genres: topGenres,
      tracksWithFeatures: bpmValues.length + energyValues.length + valenceValues.length,
      totalTracks: tracks.length,
    })
    
    return {
      bpm: avg(bpmValues),
      energy: avg(energyValues),
      valence: avg(valenceValues),
      genres: topGenres,
    }
  }
  
  /**
   * Определяем время суток
   */
  private getTimeOfDay(date: Date): 'morning' | 'day' | 'evening' | 'night' {
    const hour = date.getHours()
    if (hour >= 6 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 18) return 'day'
    if (hour >= 18 && hour < 23) return 'evening'
    return 'night'
  }
  
  /**
   * Рассчитываем уверенность паттерна
   */
  private calculateConfidence(cluster: Cluster): number {
    const trackScore = Math.min(1, cluster.tracks.length / 50)  // 50+ треков = 1.0
    const sessionScore = Math.min(1, cluster.sessionCount / 10)  // 10+ сессий = 1.0
    
    return (trackScore * 0.6 + sessionScore * 0.4)
  }
  
  /**
   * Генерируем ID паттерна
   */
  private generateId(timeOfDay: string): string {
    return `auto-${timeOfDay}-${Date.now()}`
  }
}

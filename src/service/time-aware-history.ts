/**
 * Time-Aware History - Бонус треков по времени суток
 * 
 * Даёт бонус трекам, которые пользователь слушал в ЭТО ЖЕ время суток ранее
 * Формула: timeBonus = 10 × (1 + playCount / 5) × recencyWeight
 * 
 * Контекст времени:
 * - Утро (6-12): morning
 * - День (12-18): day  
 * - Вечер (18-22): evening
 * - Ночь (22-6): night
 * 
 * Реализует "Time Decay" - более старые прослушивания имеют меньший вес
 * 
 * Пример:
 * - Трек слушали в 9 утра 3 раза → бонус утром сегодня: 10 × (1 + 3/5) × 1.0 = 16
 * - Трек слушали вчера в это же время → recencyWeight = 0.8
 * - Трек слушали неделю назад → recencyWeight = 0.3
 */

import { behaviorTracker } from './behavior-tracker'
import type { PlayEvent } from './behavior-tracker'

export interface TimeAwareScore {
  trackId: string
  timeBonus: number
  playCountInTimeSlot: number
  lastPlayedInTimeSlot: number | null
  recencyWeight: number
  preferredHours: number[]
  preferredTimeContext: string | null
}

export interface HourlyListeningData {
  [hour: number]: {
    [trackId: string]: {
      playCount: number
      lastPlayed: number  // timestamp
      likeCount: number
      skipCount: number
    }
  }
}

const STORAGE_KEY_HOURLY_DATA = 'kumaflow:time-aware-hourly-data'
const MAX_HOURLY_DATA_ENTRIES = 5000  // Макс треков в хранилище

// Временные слоты
export type TimeContext = 'morning' | 'day' | 'evening' | 'night'

export const TIME_SLOTS: Record<TimeContext, { start: number; end: number }> = {
  morning: { start: 6, end: 12 },
  day: { start: 12, end: 18 },
  evening: { start: 18, end: 22 },
  night: { start: 22, end: 6 },  // 22-6 (через полночь)
}

export class TimeAwareHistory {
  private hourlyData: HourlyListeningData = {}

  constructor() {
    this.loadHourlyData()
  }

  /**
   * Записать прослушивание трека с временным контекстом
   */
  async logPlay(trackId: string, timestamp: number = Date.now()): Promise<void> {
    const hour = new Date(timestamp).getHours()
    
    if (!this.hourlyData[hour]) {
      this.hourlyData[hour] = {}
    }

    if (!this.hourlyData[hour][trackId]) {
      this.hourlyData[hour][trackId] = {
        playCount: 0,
        lastPlayed: 0,
        likeCount: 0,
        skipCount: 0,
      }
    }

    this.hourlyData[hour][trackId].playCount++
    this.hourlyData[hour][trackId].lastPlayed = timestamp

    // Ограничиваем размер хранилища
    this.enforceMaxEntries()
    this.saveHourlyData()
  }

  /**
   * Записать лайк трека
   */
  logLike(trackId: string, timestamp: number = Date.now()): void {
    const hour = new Date(timestamp).getHours()
    
    if (!this.hourlyData[hour]) {
      this.hourlyData[hour] = {}
    }

    if (!this.hourlyData[hour][trackId]) {
      this.hourlyData[hour][trackId] = {
        playCount: 0,
        lastPlayed: 0,
        likeCount: 0,
        skipCount: 0,
      }
    }

    this.hourlyData[hour][trackId].likeCount++
    this.saveHourlyData()
  }

  /**
   * Записать пропуск трека
   */
  logSkip(trackId: string, timestamp: number = Date.now()): void {
    const hour = new Date(timestamp).getHours()
    
    if (!this.hourlyData[hour]) {
      this.hourlyData[hour] = {}
    }

    if (!this.hourlyData[hour][trackId]) {
      this.hourlyData[hour][trackId] = {
        playCount: 0,
        lastPlayed: 0,
        likeCount: 0,
        skipCount: 0,
      }
    }

    this.hourlyData[hour][trackId].skipCount++
    this.saveHourlyData()
  }

  /**
   * Рассчитать бонус трека для текущего времени
   * 
   * Формула: timeBonus = 10 × (1 + playCount / 5) × recencyWeight
   */
  getTimeBonus(trackId: string, currentTime: number = Date.now()): TimeAwareScore {
    const currentHour = new Date(currentTime).getHours()
    const currentTimeContext = this.getTimeContext(currentHour)
    
    // Собираем данные из текущего и соседних временных слотов
    let totalPlayCount = 0
    let totalLikeCount = 0
    let totalSkipCount = 0
    let lastPlayedTimestamp: number | null = null
    const preferredHours: number[] = []

    // Проверяем текущий час и соседние (±1 час)
    const hoursToCheck = this.getNearbyHours(currentHour)

    for (const hour of hoursToCheck) {
      if (this.hourlyData[hour] && this.hourlyData[hour][trackId]) {
        const data = this.hourlyData[hour][trackId]
        totalPlayCount += data.playCount
        totalLikeCount += data.likeCount
        totalSkipCount += data.skipCount

        if (!lastPlayedTimestamp || data.lastPlayed > lastPlayedTimestamp) {
          lastPlayedTimestamp = data.lastPlayed
        }

        // Если трек часто слушают в этот час - добавляем в предпочтительные
        if (data.playCount >= 2) {
          preferredHours.push(hour)
        }
      }
    }

    // Рассчитываем recency weight
    const recencyWeight = this.calculateRecencyWeight(lastPlayedTimestamp, currentTime)

    // Формула: 10 × (1 + playCount / 5) × recencyWeight
    const timeBonus = 10 * (1 + totalPlayCount / 5) * recencyWeight

    // Определяем предпочтительный временной контекст
    const preferredTimeContext = this.getPreferredTimeContext(trackId)

    return {
      trackId,
      timeBonus,
      playCountInTimeSlot: totalPlayCount,
      lastPlayedInTimeSlot: lastPlayedTimestamp,
      recencyWeight,
      preferredHours: preferredHours.sort((a, b) => b - a).slice(0, 5),
      preferredTimeContext,
    }
  }

  /**
   * Получить предпочтительные треки для текущего времени
   */
  getTopTracksForCurrentTime(limit: number = 20): TimeAwareScore[] {
    const currentHour = new Date().getHours()
    const hoursToCheck = this.getNearbyHours(currentHour)
    
    const trackScores: Map<string, TimeAwareScore> = new Map()

    for (const hour of hoursToCheck) {
      if (!this.hourlyData[hour]) continue

      for (const trackId of Object.keys(this.hourlyData[hour])) {
        if (!trackScores.has(trackId)) {
          trackScores.set(trackId, this.getTimeBonus(trackId))
        }
      }
    }

    // Сортируем по бонусу и берём топ
    return Array.from(trackScores.values())
      .filter(score => score.timeBonus > 0)
      .sort((a, b) => b.timeBonus - a.timeBonus)
      .slice(0, limit)
  }

  /**
   * Получить предпочтительные часы трека
   */
  getTrackPreferredHours(trackId: string): number[] {
    const preferredHours: number[] = []

    for (let hour = 0; hour < 24; hour++) {
      if (this.hourlyData[hour] && this.hourlyData[hour][trackId]) {
        const data = this.hourlyData[hour][trackId]
        if (data.playCount >= 2) {
          preferredHours.push(hour)
        }
      }
    }

    return preferredHours.sort((a, b) => b - a)
  }

  /**
   * Получить временной контекст трека
   */
  getTrackTimeContext(trackId: string): TimeContext | null {
    const context = this.getPreferredTimeContext(trackId)
    return context
  }

  /**
   * Получить статистику прослушиваний по часам
   */
  getHourlyStats(): { [hour: number]: { totalPlays: number; uniqueTracks: number } } {
    const stats: { [hour: number]: { totalPlays: number; uniqueTracks: number } } = {}

    for (let hour = 0; hour < 24; hour++) {
      if (this.hourlyData[hour]) {
        const totalPlays = Object.values(this.hourlyData[hour]).reduce(
          (sum, data) => sum + data.playCount, 0
        )
        stats[hour] = {
          totalPlays,
          uniqueTracks: Object.keys(this.hourlyData[hour]).length,
        }
      }
    }

    return stats
  }

  /**
   * Рассчитать recency weight
   * 
   * - Сегодня: 1.0
   * - Вчера: 0.8
   * - 2-3 дня назад: 0.6
   * - Неделя назад: 0.3
   * - Месяц назад: 0.1
   */
  private calculateRecencyWeight(
    lastPlayed: number | null,
    currentTime: number
  ): number {
    if (!lastPlayed) return 0

    const hoursAgo = (currentTime - lastPlayed) / (1000 * 60 * 60)
    const daysAgo = hoursAgo / 24

    if (daysAgo < 1) return 1.0          // Сегодня
    if (daysAgo < 2) return 0.8          // Вчера
    if (daysAgo < 3) return 0.6          // 2-3 дня
    if (daysAgo < 7) return 0.3          // Неделя
    if (daysAgo < 30) return 0.1         // Месяц
    return 0.05                           // Старше месяца
  }

  /**
   * Получить предпочтительный временной контекст трека
   */
  private getPreferredTimeContext(trackId: string): TimeContext | null {
    const contextScores: Record<TimeContext, number> = {
      morning: 0,
      day: 0,
      evening: 0,
      night: 0,
    }

    for (let hour = 0; hour < 24; hour++) {
      if (this.hourlyData[hour] && this.hourlyData[hour][trackId]) {
        const data = this.hourlyData[hour][trackId]
        const timeContext = this.getTimeContext(hour)
        contextScores[timeContext] += data.playCount
      }
    }

    // Находим контекст с максимальным счётом
    let maxScore = 0
    let maxContext: TimeContext | null = null

    for (const [context, score] of Object.entries(contextScores)) {
      if (score > maxScore) {
        maxScore = score
        maxContext = context as TimeContext
      }
    }

    return maxContext
  }

  /**
   * Получить соседние часы (±1 час)
   */
  private getNearbyHours(currentHour: number): number[] {
    const prev = currentHour === 0 ? 23 : currentHour - 1
    const next = currentHour === 23 ? 0 : currentHour + 1
    return [currentHour, prev, next]
  }

  /**
   * Получить временной контекст по часу
   */
  private getTimeContext(hour: number): TimeContext {
    if (hour >= 6 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 18) return 'day'
    if (hour >= 18 && hour < 22) return 'evening'
    return 'night'  // 22-6
  }

  /**
   * Ограничить размер хранилища
   */
  private enforceMaxEntries(): void {
    let totalEntries = 0
    
    for (const hour of Object.keys(this.hourlyData)) {
      totalEntries += Object.keys(this.hourlyData[parseInt(hour)]).length
    }

    // Если превысили лимит - удаляем самые старые записи
    if (totalEntries > MAX_HOURLY_DATA_ENTRIES) {
      console.warn(`[TimeAware] Storage limit exceeded (${totalEntries}), cleaning up...`)
      this.cleanupOldestEntries()
    }
  }

  /**
   * Удалить самые старые записи
   */
  private cleanupOldestEntries(): void {
    const allEntries: Array<{
      hour: number
      trackId: string
      lastPlayed: number
      data: any
    }> = []

    for (const [hourStr, tracks] of Object.entries(this.hourlyData)) {
      const hour = parseInt(hourStr)
      for (const [trackId, data] of Object.entries(tracks)) {
        allEntries.push({
          hour,
          trackId,
          lastPlayed: data.lastPlayed,
          data,
        })
      }
    }

    // Сортируем по lastPlayed (старые сначала)
    allEntries.sort((a, b) => a.lastPlayed - b.lastPlayed)

    // Удаляем 20% самых старых
    const toRemove = Math.floor(allEntries.length * 0.2)
    for (let i = 0; i < toRemove; i++) {
      const entry = allEntries[i]
      if (this.hourlyData[entry.hour] && this.hourlyData[entry.hour][entry.trackId]) {
        delete this.hourlyData[entry.hour][entry.trackId]
      }
    }

    // Удаляем пустые часы
    for (const hourStr of Object.keys(this.hourlyData)) {
      const hour = parseInt(hourStr)
      if (Object.keys(this.hourlyData[hour]).length === 0) {
        delete this.hourlyData[hour]
      }
    }

    console.log(`[TimeAware] Cleaned up ${toRemove} oldest entries`)
  }

  /**
   * Очистить данные старше N дней
   */
  cleanup(maxAgeDays: number = 30): void {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000)

    for (const [hourStr, tracks] of Object.entries(this.hourlyData)) {
      const hour = parseInt(hourStr)
      for (const [trackId, data] of Object.entries(tracks)) {
        if (data.lastPlayed < cutoff) {
          delete this.hourlyData[hour][trackId]
        }
      }
      // Удаляем пустые часы
      if (Object.keys(this.hourlyData[hour]).length === 0) {
        delete this.hourlyData[hour]
      }
    }

    this.saveHourlyData()
    console.log(`[TimeAware] Cleaned up data older than ${maxAgeDays} days`)
  }

  /**
   * Сбросить все данные
   */
  reset(): void {
    this.hourlyData = {}
    this.saveHourlyData()
    console.log('[TimeAware] All data reset')
  }

  // === Persistence ===

  private loadHourlyData(): void {
    if (typeof localStorage === 'undefined') return  // Not in browser
    try {
      const raw = localStorage.getItem(STORAGE_KEY_HOURLY_DATA)
      if (raw) {
        this.hourlyData = JSON.parse(raw)
        console.log(`[TimeAware] Loaded hourly data: ${Object.keys(this.hourlyData).length} hours`)
      }
    } catch (e) {
      console.error('[TimeAware] Failed to load hourly data:', e)
      this.hourlyData = {}
    }
  }

  private saveHourlyData(): void {
    try {
      localStorage.setItem(STORAGE_KEY_HOURLY_DATA, JSON.stringify(this.hourlyData))
    } catch (e) {
      console.error('[TimeAware] Failed to save hourly data:', e)
    }
  }
}

// Экспортируем единственный экземпляр
export const timeAwareHistory = new TimeAwareHistory()

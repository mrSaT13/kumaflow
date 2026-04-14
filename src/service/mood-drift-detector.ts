/**
 * Mood Drift Detection - Определение смены настроения
 * 
 * Отслеживает последовательные пропуски треков (3+) для обнаружения смены настроения
 * Когда пользователь пропускает треки подряд, система автоматически корректирует
 * профиль настроения и подбирает более подходящую музыку
 * 
 * Механизм:
 * - 3 пропуска подряд → mild mood shift (корректировка energy ±0.1)
 * - 5 пропусков подряд → moderate mood shift (корректировка energy ±0.2, смена mood профиля)
 * - 7+ пропусков подряд → strong mood shift (полный сброс seed-треков, новая генерация)
 * 
 * Контекст:
 * - Время суток учитывается (утро/день/вечер/ночь)
 * - День недели учитывается (будни/выходные)
 * - История изменений настроения сохраняется для анализа паттернов
 */

import { behaviorTracker } from './behavior-tracker'
import type { ISong } from '@/types/responses/song'

export interface MoodShiftEvent {
  timestamp: number
  severity: 'mild' | 'moderate' | 'strong'
  consecutiveSkips: number
  previousMood: MoodProfile | null
  newMood: MoodProfile
  timeContext: 'morning' | 'day' | 'evening' | 'night'
  dayOfWeek: number
}

export interface MoodProfile {
  energy: number        // 0.0 - 1.0
  valence: number       // 0.0 - 1.0 (положительность)
  tempo: number         // BPM
  mood: 'energetic' | 'happy' | 'calm' | 'sad' | 'relaxed' | 'focused'
  activity: 'wakeup' | 'commute' | 'work' | 'workout' | 'sleep' | ''
}

export interface ConsecutiveSkipState {
  skippedTrackIds: string[]
  skipTimestamps: number[]
  lastSkipTime: number
  count: number
}

const STORAGE_KEY_MOOD_HISTORY = 'kumaflow:mood-history'
const STORAGE_KEY_SKIP_STATE = 'kumaflow:consecutive-skips'
const STORAGE_KEY_MOOD_PROFILE = 'kumaflow:current-mood-profile'
const STORAGE_KEY_TEMP_BANS = 'kumaflow:temp-bans'
const STORAGE_KEY_SKIP_PATTERNS = 'kumaflow:skip-patterns'

const MAX_MOOD_HISTORY = 100
const CONSECUTIVE_SKIP_THRESHOLD_SOFT = 2    // 🆕 Soft Drift
const CONSECUTIVE_SKIP_THRESHOLD_MILD = 3
const CONSECUTIVE_SKIP_THRESHOLD_MODERATE = 5
const CONSECUTIVE_SKIP_THRESHOLD_STRONG = 7

const TEMP_BAN_DURATION_MS = 30 * 60 * 1000  // 30 минут
const SKIP_PATTERN_WINDOW_MS = 60 * 60 * 1000 // 1 час для анализа паттернов

export interface TempBan {
  targetId: string
  type: 'artist' | 'genre' | 'track'
  expiresAt: number
  reason: string
}

export interface SkipPattern {
  genre: string
  artistId?: string
  skipCount: number
  lastSkipTime: number
}

export class MoodDriftDetector {
  private currentState: ConsecutiveSkipState | null = null
  private moodHistory: MoodShiftEvent[] = []
  private currentProfile: MoodProfile | null = null
  
  // 🆕 Temp Bans и Skip Patterns
  private tempBans: TempBan[] = []
  private skipPatterns: SkipPattern[] = []

  constructor() {
    this.loadState()
  }

  /**
   * Записать пропуск трека
   */
  async logSkip(trackId: string, song?: ISong): Promise<void> {
    const now = Date.now()

    if (!this.currentState) {
      this.currentState = {
        skippedTrackIds: [trackId],
        skipTimestamps: [now],
        lastSkipTime: now,
        count: 1,
      }
    } else {
      // Проверяем что пропуск в пределах окна (последние 10 минут)
      const timeWindow = 10 * 60 * 1000 // 10 минут
      if (now - this.currentState.lastSkipTime > timeWindow) {
        // Сбрасываем если прошло много времени
        this.currentState = {
          skippedTrackIds: [trackId],
          skipTimestamps: [now],
          lastSkipTime: now,
          count: 1,
        }
      } else {
        this.currentState.skippedTrackIds.push(trackId)
        this.currentState.skipTimestamps.push(now)
        this.currentState.lastSkipTime = now
        this.currentState.count++
      }
    }

    // 🆕 Reason Inference: отслеживаем паттерны пропусков по жанрам/артистам
    if (song) {
      this.updateSkipPatterns(song, now)
    }

    this.saveSkipState()

    // 🆕 Soft Drift: 2 пропуска → предлагаем трек из другого кластера
    if (this.currentState.count === CONSECUTIVE_SKIP_THRESHOLD_SOFT) {
      console.log('[MoodDrift] 🔄 Soft Drift: 2 skips detected, suggesting alternative cluster')
      // Возвращаем сигнал для UI чтобы предложил альтернативный трек
      this.triggerSoftDrift()
    }

    // Проверяем порог mood drift (3+)
    if (this.currentState.count >= CONSECUTIVE_SKIP_THRESHOLD_MILD) {
      await this.detectMoodShift()
    }
  }

  /**
   * Записать прослушивание/лайк (сбрасывает счётчик пропусков)
   */
  logPositiveInteraction(trackId: string): void {
    // Положительное действие сбрасывает consecutive skips
    if (this.currentState) {
      console.log(`[MoodDrift] Positive interaction, resetting skip counter (was ${this.currentState.count})`)
      this.currentState = null
      this.saveSkipState()
    }
  }

  /**
   * Определить сдвиг настроения
   */
  private async detectMoodShift(): Promise<void> {
    if (!this.currentState || this.currentState.count < CONSECUTIVE_SKIP_THRESHOLD_MILD) {
      return
    }

    const severity = this.getSeverity(this.currentState.count)
    const timeContext = this.getTimeContext()
    const dayOfWeek = new Date().getDay()

    // Определяем новое настроение на основе контекста
    const newMood = this.calculateNewMoodProfile(severity, timeContext, dayOfWeek)
    const previousMood = this.currentProfile

    const shiftEvent: MoodShiftEvent = {
      timestamp: Date.now(),
      severity,
      consecutiveSkips: this.currentState.count,
      previousMood,
      newMood,
      timeContext,
      dayOfWeek,
    }

    // Сохраняем событие в историю
    this.moodHistory.unshift(shiftEvent)
    this.moodHistory = this.moodHistory.slice(0, MAX_MOOD_HISTORY)
    this.saveMoodHistory()

    // Обновляем текущий профиль
    this.currentProfile = newMood
    this.saveMoodProfile()

    console.log(`[MoodDrift] Mood shift detected: ${severity} (${this.currentState.count} skips)`, newMood)

    // Сбрасываем счётчик после детекции
    this.currentState = null
    this.saveSkipState()
  }

  /**
   * Рассчитать новый профиль настроения
   */
  private calculateNewMoodProfile(
    severity: 'mild' | 'moderate' | 'strong',
    timeContext: string,
    dayOfWeek: number
  ): MoodProfile {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const hour = new Date().getHours()

    // Базовый профиль из текущего или дефолтный
    let base = this.currentProfile || this.getDefaultProfile(timeContext, isWeekend)

    // Корректировка в зависимости от severity
    let energyDelta = 0
    let valenceDelta = 0
    let tempoDelta = 0

    switch (severity) {
      case 'mild':
        energyDelta = -0.1
        valenceDelta = -0.05
        tempoDelta = -10
        break
      case 'moderate':
        energyDelta = -0.2
        valenceDelta = -0.1
        tempoDelta = -20
        break
      case 'strong':
        // Полный сброс к профилю подходящему для текущего времени
        return this.getDefaultProfile(timeContext, isWeekend)
    }

    // Адаптация к времени суток
    const timeAdapted = this.adaptToTimeOfDay(base, hour)

    // Применяем дельты
    const newEnergy = Math.max(0, Math.min(1, timeAdapted.energy + energyDelta))
    const newValence = Math.max(0, Math.min(1, timeAdapted.valence + valenceDelta))
    const newTempo = Math.max(60, Math.min(200, timeAdapted.tempo + tempoDelta))

    // Определяем mood label
    const newMoodLabel = this.determineMoodLabel(newEnergy, newValence)

    return {
      energy: newEnergy,
      valence: newValence,
      tempo: newTempo,
      mood: newMoodLabel,
      activity: this.inferActivity(hour, isWeekend),
    }
  }

  /**
   * Адаптация к времени суток
   */
  private adaptToTimeOfDay(profile: MoodProfile, hour: number): MoodProfile {
    let adapted = { ...profile }

    // Утро (6-12): постепенно повышаем энергию
    if (hour >= 6 && hour < 9) {
      adapted.energy = Math.min(1, adapted.energy + 0.1)
      adapted.tempo = Math.min(200, adapted.tempo + 5)
    }
    // Полдень (12-14): пик энергии
    else if (hour >= 12 && hour < 14) {
      adapted.energy = Math.min(1, adapted.energy + 0.05)
    }
    // После обеда (14-17): лёгкий спад
    else if (hour >= 14 && hour < 17) {
      adapted.energy = Math.max(0, adapted.energy - 0.05)
    }
    // Вечер (18-22): снижение энергии
    else if (hour >= 18 && hour < 22) {
      adapted.energy = Math.max(0, adapted.energy - 0.1)
      adapted.valence = Math.max(0, adapted.valence - 0.05)
    }
    // Ночь (22-6): минимальная энергия
    else if (hour >= 22 || hour < 6) {
      adapted.energy = Math.max(0, adapted.energy - 0.2)
      adapted.tempo = Math.max(60, adapted.tempo - 15)
    }

    return adapted
  }

  /**
   * Получить дефолтный профиль для контекста
   */
  private getDefaultProfile(timeContext: string, isWeekend: boolean): MoodProfile {
    const hour = new Date().getHours()

    switch (timeContext) {
      case 'morning':
        return {
          energy: 0.6,
          valence: 0.7,
          tempo: 110,
          mood: 'happy',
          activity: 'wakeup',
        }
      case 'day':
        return {
          energy: 0.7,
          valence: 0.6,
          tempo: 120,
          mood: 'energetic',
          activity: isWeekend ? '' : 'work',
        }
      case 'evening':
        return {
          energy: 0.5,
          valence: 0.6,
          tempo: 100,
          mood: 'relaxed',
          activity: '',
        }
      case 'night':
        return {
          energy: 0.3,
          valence: 0.4,
          tempo: 80,
          mood: 'calm',
          activity: 'sleep',
        }
      default:
        return {
          energy: 0.5,
          valence: 0.5,
          tempo: 100,
          mood: 'relaxed',
          activity: '',
        }
    }
  }

  /**
   * Определить label настроения
   */
  private determineMoodLabel(energy: number, valence: number): MoodProfile['mood'] {
    if (energy > 0.7 && valence > 0.6) return 'energetic'
    if (energy > 0.5 && valence > 0.7) return 'happy'
    if (energy < 0.4 && valence < 0.4) return 'sad'
    if (energy < 0.5) return 'calm'
    if (energy < 0.6 && valence > 0.5) return 'relaxed'
    if (energy > 0.6 && valence < 0.5) return 'focused'
    return 'relaxed'
  }

  /**
   * Вывести активность
   */
  private inferActivity(hour: number, isWeekend: boolean): MoodProfile['activity'] {
    if (hour >= 6 && hour < 9) return 'wakeup'
    if (hour >= 9 && hour < 18) return isWeekend ? '' : 'work'
    if (hour >= 18 && hour < 22) return ''
    if (hour >= 22 || hour < 6) return 'sleep'
    return ''
  }

  /**
   * Получить severity по количеству пропусков
   */
  private getSeverity(skipCount: number): 'mild' | 'moderate' | 'strong' {
    if (skipCount >= CONSECUTIVE_SKIP_THRESHOLD_STRONG) return 'strong'
    if (skipCount >= CONSECUTIVE_SKIP_THRESHOLD_MODERATE) return 'moderate'
    return 'mild'
  }

  /**
   * Получить контекст времени
   */
  private getTimeContext(): 'morning' | 'day' | 'evening' | 'night' {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 18) return 'day'
    if (hour >= 18 && hour < 24) return 'evening'
    return 'night'
  }

  /**
   * Получить текущий профиль настроения
   */
  getCurrentProfile(): MoodProfile | null {
    return this.currentProfile
  }

  /**
   * Получить историю сдвигов настроения
   */
  getMoodHistory(): MoodShiftEvent[] {
    return this.moodHistory
  }

  /**
   * Получить текущее количество последовательных пропусков
   */
  getConsecutiveSkipCount(): number {
    return this.currentState?.count || 0
  }

  /**
   * Проверить нужен ли полный сброс плейлиста
   */
  needsPlaylistReset(): boolean {
    return this.currentState?.count >= CONSECUTIVE_SKIP_THRESHOLD_STRONG
  }

  /**
   * Сбросить профиль вручную
   */
  resetProfile(): void {
    this.currentProfile = null
    this.currentState = null
    this.moodHistory = []
    this.saveMoodProfile()
    this.saveSkipState()
    this.saveMoodHistory()
    console.log('[MoodDrift] Profile reset')
  }

  /**
   * Применить mood drift к плейлисту
   * Возвращает параметры для фильтрации/скоринга треков
   */
  getPlaylistAdjustments(): {
    energyMin?: number
    energyMax?: number
    tempoMax?: number
    moodFilter?: MoodProfile['mood']
    skipRecentTrackIds: string[]
  } {
    if (!this.currentProfile) {
      return { skipRecentTrackIds: [] }
    }

    const adjustments: any = {
      skipRecentTrackIds: this.currentState?.skippedTrackIds || [],
    }

    // Применяем корректировки в зависимости от профиля
    adjustments.energyMax = this.currentProfile.energy + 0.1
    adjustments.tempoMax = this.currentProfile.tempo + 10
    adjustments.moodFilter = this.currentProfile.mood

    return adjustments
  }

  /**
   * 🆕 Soft Drift: предложить альтернативный кластер
   */
  private triggerSoftDrift(): void {
    console.log('[MoodDrift] 🎲 Soft Drift triggered: suggesting alternative cluster')
    // Здесь можно отправить событие в UI для предложения альтернативного трека
    // Пока просто лог — UI может отреагировать на getConsecutiveSkipCount() === 2
  }

  /**
   * 🆕 Reason Inference: обновить паттерны пропусков
   */
  private updateSkipPatterns(song: ISong, timestamp: number): void {
    const genre = song.genre || 'Unknown'
    const artistId = song.artistId

    // Ищем существующий паттерн
    let pattern = this.skipPatterns.find(p => p.genre === genre && p.artistId === artistId)
    
    if (!pattern) {
      pattern = { genre, artistId, skipCount: 0, lastSkipTime: 0 }
      this.skipPatterns.push(pattern)
    }

    // Очищаем старые паттерны (> 1 часа)
    const cutoff = timestamp - SKIP_PATTERN_WINDOW_MS
    this.skipPatterns = this.skipPatterns.filter(p => p.lastSkipTime > cutoff)

    pattern.skipCount++
    pattern.lastSkipTime = timestamp

    console.log(`[MoodDrift] 📊 Skip pattern: ${genre} ${artistId || ''} → ${pattern.skipCount} skips`)

    // Очищаем старые паттерны и сохраняем
    this.skipPatterns = this.skipPatterns.filter(p => p.lastSkipTime > cutoff)
    this.saveSkipPatterns()

    // 🆕 Temp Ban: 3+ пропуска жанра за час → бан на 30 минут
    const genreSkips = this.skipPatterns.filter(p => p.genre === genre && p.lastSkipTime > cutoff)
    const totalGenreSkips = genreSkips.reduce((sum, p) => sum + p.skipCount, 0)

    if (totalGenreSkips >= 3) {
      this.addTempBan(genre, 'genre', TEMP_BAN_DURATION_MS, `3 genre skips in 1h: ${genre}`)
    }

    // 3+ пропуска одного артиста → бан на 30 мин
    if (artistId && pattern.skipCount >= 3) {
      this.addTempBan(artistId, 'artist', TEMP_BAN_DURATION_MS, `3 artist skips in 1h`)
    }
  }

  /**
   * 🆕 Temp Ban: добавить временный бан
   */
  addTempBan(targetId: string, type: TempBan['type'], durationMs: number, reason: string): void {
    const ban: TempBan = {
      targetId,
      type,
      expiresAt: Date.now() + durationMs,
      reason,
    }

    this.tempBans.push(ban)
    this.saveTempBans()

    console.log(`[MoodDrift] 🚫 Temp ban: ${type} ${targetId} for ${durationMs / 60000}min (${reason})`)
  }

  /**
   * 🆕 Temp Ban: проверить забанен ли target
   */
  isTempBanned(targetId: string, type: TempBan['type']): boolean {
    const now = Date.now()
    
    // Очищаем истёкшие баны
    this.tempBans = this.tempBans.filter(ban => ban.expiresAt > now)
    
    const ban = this.tempBans.find(b => b.targetId === targetId && b.type === type)
    
    if (ban) {
      const remainingMin = Math.ceil((ban.expiresAt - now) / 60000)
      console.log(`[MoodDrift] 🚫 Target ${targetId} (${type}) is banned for ${remainingMin}min more`)
      return true
    }
    
    return false
  }

  /**
   * 🆕 Temp Ban: получить все активные баны
   */
  getActiveTempBans(): TempBan[] {
    const now = Date.now()
    this.tempBans = this.tempBans.filter(ban => ban.expiresAt > now)
    return this.tempBans
  }

  /**
   * 🆕 Temp Ban: снять бан вручную
   */
  removeTempBan(targetId: string, type: TempBan['type']): void {
    this.tempBans = this.tempBans.filter(b => !(b.targetId === targetId && b.type === type))
    this.saveTempBans()
    console.log(`[MoodDrift] ✅ Temp ban removed: ${type} ${targetId}`)
  }

  // === Persistence ===

  private loadState(): void {
    if (typeof localStorage === 'undefined') return  // Not in browser (Electron main process)
    try {
      const skipStateRaw = localStorage.getItem(STORAGE_KEY_SKIP_STATE)
      if (skipStateRaw) {
        this.currentState = JSON.parse(skipStateRaw)
      }

      const moodHistoryRaw = localStorage.getItem(STORAGE_KEY_MOOD_HISTORY)
      if (moodHistoryRaw) {
        this.moodHistory = JSON.parse(moodHistoryRaw)
      }

      const profileRaw = localStorage.getItem(STORAGE_KEY_MOOD_PROFILE)
      if (profileRaw) {
        this.currentProfile = JSON.parse(profileRaw)
      }

      // 🆕 Загрузка temp bans и skip patterns
      const tempBansRaw = localStorage.getItem(STORAGE_KEY_TEMP_BANS)
      if (tempBansRaw) {
        this.tempBans = JSON.parse(tempBansRaw)
      }

      const skipPatternsRaw = localStorage.getItem(STORAGE_KEY_SKIP_PATTERNS)
      if (skipPatternsRaw) {
        this.skipPatterns = JSON.parse(skipPatternsRaw)
      }
    } catch (e) {
      console.error('[MoodDrift] Failed to load state:', e)
    }
  }

  private saveSkipState(): void {
    try {
      if (this.currentState) {
        localStorage.setItem(STORAGE_KEY_SKIP_STATE, JSON.stringify(this.currentState))
      } else {
        localStorage.removeItem(STORAGE_KEY_SKIP_STATE)
      }
    } catch (e) {
      console.error('[MoodDrift] Failed to save skip state:', e)
    }
  }

  private saveMoodHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEY_MOOD_HISTORY, JSON.stringify(this.moodHistory))
    } catch (e) {
      console.error('[MoodDrift] Failed to save mood history:', e)
    }
  }

  private saveMoodProfile(): void {
    try {
      if (this.currentProfile) {
        localStorage.setItem(STORAGE_KEY_MOOD_PROFILE, JSON.stringify(this.currentProfile))
      } else {
        localStorage.removeItem(STORAGE_KEY_MOOD_PROFILE)
      }
    } catch (e) {
      console.error('[MoodDrift] Failed to save mood profile:', e)
    }
  }

  // 🆕 Сохранение temp bans и skip patterns
  private saveTempBans(): void {
    try {
      localStorage.setItem(STORAGE_KEY_TEMP_BANS, JSON.stringify(this.tempBans))
    } catch (e) {
      console.error('[MoodDrift] Failed to save temp bans:', e)
    }
  }

  private saveSkipPatterns(): void {
    try {
      localStorage.setItem(STORAGE_KEY_SKIP_PATTERNS, JSON.stringify(this.skipPatterns))
    } catch (e) {
      console.error('[MoodDrift] Failed to save skip patterns:', e)
    }
  }
}

// Экспортируем единственный экземпляр
export const moodDriftDetector = new MoodDriftDetector()

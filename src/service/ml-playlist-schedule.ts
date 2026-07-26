/**
 * Расписание автогенерации ML плейлистов
 */

export const DAILY_MIX_TARGET_HOURS = 8
export const TIME_OF_DAY_TARGET_HOURS = 4
export const TIME_OF_DAY_UPDATE_HOURS = 4
export const AVG_TRACK_DURATION_SEC = 210

export type TimeOfDaySlot = 'morning' | 'day' | 'evening' | 'night'

export function getTodayDateKey(date = new Date()): string {
  return date.toISOString().split('T')[0]
}

export function getTimeOfDaySlot(date = new Date()): TimeOfDaySlot {
  const hour = date.getHours()

  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'day'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

export function calculateTrackCountForHours(
  hours: number,
  avgDurationSec = AVG_TRACK_DURATION_SEC,
): number {
  const totalSec = hours * 60 * 60
  return Math.max(20, Math.ceil(totalSec / avgDurationSec))
}

/** Новый daily-mix: новый календарный день после последней генерации */
export function shouldRegenerateDailyMix(lastGenerated?: string): boolean {
  if (!lastGenerated) return true

  const lastDate = getTodayDateKey(new Date(lastGenerated))
  const today = getTodayDateKey()

  return today !== lastDate
}

/** Новый time-of-day: прошло 4+ часа или сменился период суток */
export function shouldRegenerateTimeOfDay(lastGenerated?: string): boolean {
  if (!lastGenerated) return true

  const last = new Date(lastGenerated)
  const now = new Date()
  const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

  if (hoursSince >= TIME_OF_DAY_UPDATE_HOURS) return true
  if (getTimeOfDaySlot(last) !== getTimeOfDaySlot(now)) return true

  return false
}

/** Минуты до следующей полночи (локальное время) */
export function minutesUntilMidnight(date = new Date()): number {
  const next = new Date(date)
  next.setHours(24, 0, 0, 0)
  return Math.max(0, Math.round((next.getTime() - date.getTime()) / 60000))
}

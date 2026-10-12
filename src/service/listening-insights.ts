/**
 * Инсайты по реальному поведению пользователя.
 *
 * Всё считается из behaviorTracker — это единственный источник событий с
 * корректными timestamp. Раньше logEvent() не проставлял timestamp, и все
 * чтения фильтровали по нему, то есть данные были пустыми (починено в
 * behavior-tracker.ts).
 *
 * Три вещи, которые пользователь не видел, хотя данные были:
 *   1. Текущий стрик дней подряд (для «завтра вернись» важен текущий,
 *      а не исторический максимум — старый calculateListeningStreak в
 *      ml.store считал именно максимум).
 *   2. Паттерн скипов: на какой секунде и как часто.
 *   3. Сколько минут реально слушали (position, а не полная длина трека).
 */

export interface DailyBucket {
  /** YYYY-MM-DD */
  date: string
  plays: number
  skips: number
  completes: number
  /** Реально прослушано секунд за день. */
  listenedSec: number
}

export interface SkipPattern {
  /** Медианная позиция скипа, секунды. */
  medianSec: number
  /** Сколько скипов всего. */
  total: number
  /** Доля скипов от всех событий. */
  skipRate: number
  /** Понятная фраза для показа. */
  headline: string
}

export interface ListeningInsights {
  days: DailyBucket[]
  currentStreak: number
  longestStreak: number
  /** Прослушано минут за все время. */
  totalMinutes: number
  /** Прослушано минут за последние 7 дней. */
  minutesLast7Days: number
  skipPattern: SkipPattern | null
  activeDays: number
}

/** Ключ дня в местной таймзоне, а не UTC: иначе вечер сдвигается на сутки. */
function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

function fmtTime(sec: number): string {
  if (sec < 60) return `${sec} с`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m} мин` : `${m}:${`${s}`.padStart(2, '0')}`
}

interface RawEvent {
  trackId: string
  timestamp: number
  action: 'play' | 'skip' | 'repeat' | 'complete' | 'like' | 'dislike'
  position: number
}

/**
 * Считает инсайты по сырым событиям.
 * Вынесено отдельно от localStorage, чтобы логику можно было тестировать.
 */
export function computeInsights(events: RawEvent[]): ListeningInsights {
  const days = new Map<string, DailyBucket>()
  const skipPositions: number[] = []
  let totalSkips = 0

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayStart = startOfToday.getTime()

  for (const e of events) {
    // События без timestamp — мусор от старых версий, где logEvent его не
    // проставлял. Они попали в localStorage до починки, поэтому их надо
    // отбросить, а не считать как 1970 год.
    if (!Number.isFinite(e.timestamp) || e.timestamp <= 0) continue

    const key = dayKey(e.timestamp)
    const bucket = days.get(key) ?? {
      date: key,
      plays: 0,
      skips: 0,
      completes: 0,
      listenedSec: 0,
    }

    if (e.action === 'play') {
      bucket.plays++
      bucket.listenedSec += Math.max(0, e.position || 0)
    } else if (e.action === 'skip') {
      bucket.skips++
      totalSkips++
      skipPositions.push(Math.max(0, e.position || 0))
    } else if (e.action === 'complete') {
      bucket.completes++
      bucket.listenedSec += Math.max(0, e.position || 0)
    }

    days.set(key, bucket)
  }

  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))

  // Текущий стрик: считаем назад от сегодня. Если сегодня не слушали, но
  // вчера слушали — стрик ещё жив, просто день «в процессе».
  let currentStreak = 0
  {
    const known = new Set(sortedDays.map((d) => d.date))
    const cursor = new Date(todayStart)
    // Если сегодня ничего нет, начинаем с вчерашнего дня.
    if (!known.has(dayKey(cursor.getTime()))) {
      cursor.setDate(cursor.getDate() - 1)
    }
    // Допускаем «вчера» как старт: день не закончился.
    for (let i = 0; i < 400; i++) {
      if (!known.has(dayKey(cursor.getTime()))) break
      currentStreak++
      cursor.setDate(cursor.getDate() - 1)
    }
  }

  // Исторический максимум — по всем дням подряд.
  let longestStreak = 0
  let run = 0
  let prevTime = 0
  for (const d of sortedDays) {
    const t = new Date(`${d.date}T00:00:00`).getTime()
    run = prevTime === 0 ? 1 : Math.round((t - prevTime) / 86_400_000) === 1 ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    prevTime = t
  }

  const totalSeconds = sortedDays.reduce((sum, d) => sum + d.listenedSec, 0)
  const weekAgo = todayStart - 6 * 86_400_000
  const last7 = sortedDays.filter(
    (d) => new Date(`${d.date}T00:00:00`).getTime() >= weekAgo,
  )

  const decided = events.filter((e) => Number.isFinite(e.timestamp) && e.timestamp > 0)
  const skipPattern: SkipPattern | null =
    totalSkips >= 3
      ? {
          medianSec: median(skipPositions),
          total: totalSkips,
          skipRate: decided.length > 0 ? totalSkips / decided.length : 0,
          headline:
            medianPositionsHeadline(median(skipPositions)),
        }
      : null

  return {
    days: sortedDays,
    currentStreak: Math.max(currentStreak, 0),
    longestStreak: Math.max(longestStreak, 0),
    totalMinutes: Math.round(totalSeconds / 60),
    minutesLast7Days: Math.round(
      last7.reduce((sum, d) => sum + d.listenedSec, 0) / 60,
    ),
    skipPattern,
    activeDays: sortedDays.length,
  }
}

function medianPositionsHeadline(sec: number): string {
  if (sec <= 5) return `Скипаете на первых секундах (${fmtTime(sec)}) — вступление не зацепило`
  if (sec <= 20) return `Обычно скипаете на ${fmtTime(sec)} — не успеваете разогнаться`
  if (sec <= 45) return `Скипаете примерно на ${fmtTime(sec)}`
  return `Дослушиваете почти всё, скипаете на ${fmtTime(sec)}`
}

/** Читает события из localStorage трекера и считает инсайты. */
export function readInsights(): ListeningInsights {
  if (typeof localStorage === 'undefined') {
    return {
      days: [],
      currentStreak: 0,
      longestStreak: 0,
      totalMinutes: 0,
      minutesLast7Days: 0,
      skipPattern: null,
      activeDays: 0,
    }
  }

  let raw: unknown
  try {
    raw = localStorage.getItem('kumaflow:behavior-events')
  } catch {
    raw = null
  }

  if (!raw || typeof raw !== 'string') {
    return {
      days: [],
      currentStreak: 0,
      longestStreak: 0,
      totalMinutes: 0,
      minutesLast7Days: 0,
      skipPattern: null,
      activeDays: 0,
    }
  }

  let parsed: RawEvent[]
  try {
    const data: unknown = JSON.parse(raw)
    parsed = Array.isArray(data) ? (data as RawEvent[]) : []
  } catch {
    parsed = []
  }

  return computeInsights(parsed)
}
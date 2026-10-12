/**
 * Реактивная подписка на инсайты по прослушиванию.
 *
 * readInsights() читает все события из localStorage и пересчитывает с нуля.
 * Вызывать его прямо в рендере нельзя: список событий растёт, и на главной
 * это десятки пересчётов за рендер. Здесь пересчёт один на хук, и общий на
 * всё приложение — виджет в плеер-баре и блок на главной читают одно и то же.
 *
 * Пересчёт триггерится на:
 *   - смену суток (полночь ломает стрик),
 *   - событие 'kumaflow:behavior-changed' от behavior-tracker,
 *   - 'storage' — если другая вкладка дописала события.
 */

import { useEffect, useState } from 'react'
import {
  readInsights,
  type ListeningInsights,
} from '@/service/listening-insights'

const EMPTY: ListeningInsights = {
  days: [],
  currentStreak: 0,
  longestStreak: 0,
  totalMinutes: 0,
  minutesLast7Days: 0,
  skipPattern: null,
  activeDays: 0,
}

/** Ключ дня в местной таймзоне — тот же формат, что у dayKey в сервисе. */
function todayKey(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

type Listener = (data: ListeningInsights) => void

const listeners = new Set<Listener>()
let subscribers = 0
let cached: ListeningInsights = EMPTY
let cachedDay = ''
let midnightTimer: number | null = null
let everComputed = false

/** Пересчитывает один раз в сутки или по событию, раздаёт всем подписчикам. */
function refresh(): ListeningInsights {
  const key = todayKey()

  if (key === cachedDay && everComputed) return cached

  cachedDay = key
  cached = readInsights()
  everComputed = true

  for (const listener of listeners) listener(cached)

  return cached
}

/** До ближайшей полуночи + 5 секунд, чтобы не пропустить смену дня. */
function msUntilMidnight(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 5, 0)
  return Math.max(1000, next.getTime() - now.getTime())
}

function scheduleMidnight() {
  if (midnightTimer !== null) clearTimeout(midnightTimer)

  midnightTimer = window.setTimeout(() => {
    midnightTimer = null
    refresh()
    if (subscribers > 0) scheduleMidnight()
  }, msUntilMidnight())
}

export function useListeningInsights(): ListeningInsights {
  const [data, setData] = useState<ListeningInsights>(() =>
    everComputed && cachedDay === todayKey() ? cached : EMPTY,
  )

  useEffect(() => {
    subscribers++

    const listener: Listener = (next) => setData(next)
    listeners.add(listener)

    const invalidate = () => {
      everComputed = false
      refresh()
    }

    window.addEventListener('kumaflow:behavior-changed', invalidate)
    window.addEventListener('storage', invalidate)

    // Первый пересчёт сразу на подписке, иначе виджет мигнёт пустым.
    refresh()

    if (midnightTimer === null) scheduleMidnight()

    return () => {
      subscribers--
      listeners.delete(listener)
      window.removeEventListener('kumaflow:behavior-changed', invalidate)
      window.removeEventListener('storage', invalidate)

      if (subscribers === 0 && midnightTimer !== null) {
        clearTimeout(midnightTimer)
        midnightTimer = null
      }
    }
  }, [])

  return data
}

/** Синхронное чтение без подписки — для обработчиков, не для рендера. */
export function peekInsights(): ListeningInsights {
  return everComputed && cachedDay === todayKey() ? cached : EMPTY
}

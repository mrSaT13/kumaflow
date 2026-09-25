/**
 * KumaFlow 1.6.2 — буфер событий мозга
 * Копим play/complete/skip/replay/seek_back/abandon + position_sec,
 * флашим пачкой каждые 20 событий или 30с. Best-effort.
 */

import { reportBrainEvents, type BrainEvent } from './brain-sync'
import { isBrainActive } from '@/store/brain.store'

const buffer: BrainEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let lastSeekPos = 0

// Кольцо последних событий для waveContinue (recent_events):
// переживает флаши буфера, чтобы добивка волны знала
// "только что скипнул/завершил". Только клиент, сервер уже умеет.
const RECENT_KEEP = 20
const recentRing: BrainEvent[] = []

export function getRecentBrainEvents(): BrainEvent[] {
  return recentRing.slice()
}

export function queueBrainEvent(e: BrainEvent) {
  if (!isBrainActive()) return
  buffer.push(e)
  recentRing.push(e)
  if (recentRing.length > RECENT_KEEP) {
    recentRing.splice(0, recentRing.length - RECENT_KEEP)
  }
  if (buffer.length >= 20) void flushBrainEvents()
}

export async function flushBrainEvents() {
  if (!isBrainActive() || buffer.length === 0) return
  const batch = buffer.splice(0, buffer.length)
  await reportBrainEvents(batch).catch(() => undefined)
}

export function startBrainFlushLoop() {
  if (flushTimer) return
  flushTimer = setInterval(() => { void flushBrainEvents() }, 30000)
}

/** Детект seek_back: отмотка назад >5с */
export function detectSeekBack(prevPos: number, nextPos: number): boolean {
  const r = prevPos - nextPos > 5
  lastSeekPos = nextPos
  return r
}

/** Удобный репорт seek_back одной строкой (гарды — на вызывателе) */
export function reportSeekBack(trackId: string, positionSec: number) {
  queueBrainEvent({ track_id: trackId, action: 'seek_back', position_sec: Math.floor(positionSec) })
}

export function getLastSeekPos() {
  return lastSeekPos
}

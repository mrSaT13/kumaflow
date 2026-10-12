/**
 * KumaFlow 1.6.2 — Brain как источник SmartAutoDJ (с фолбеком на локальный ML).
 * Очередь и управление общие, мозг только докладывает треки.
 */

import { isBrainActive, isBrainConfigured, getBrainMode } from '@/store/brain.store'
import { mapWaveSettings, waveContinue, waveNeedsRefill } from './brain-wave'
import { getRecentBrainEvents } from './brain-events'
import type { ISong } from '@/types/responses/song'
import type { BrainSkipReason } from '@/types/generation'

/** Кэш несматченных external_id: мозг не должен возвращать их по кругу. */
const missingCache = new Set<string>()
export function noteBrainMissing(ids: string[]): void {
  for (const id of ids) if (id) missingCache.add(id)
  // кап чтобы не рос бесконечно
  if (missingCache.size > 500) {
    const arr = [...missingCache].slice(-500)
    missingCache.clear()
    for (const id of arr) missingCache.add(id)
  }
}

function songKey(s: ISong): string {
  const a = (s.artist ?? '').toLowerCase().trim()
  const t = (s.title ?? '').toLowerCase().trim()
  return `${a} — ${t}`
}

export interface BrainAutoDJResult {
  songs: ISong[]
  fromBrain: boolean
  excludeIds: string[]
  /**
   * Почему мозг не отдал треки. Заполняется всегда — и когда отдал,
   * тогда 'no-tracks'. Без этого «мозг не сработал» и «мозг не настроен»
   * выглядели в логе одинаково.
   */
  reason: BrainSkipReason | null
}

/** Заготовка пустого ответа с причиной. */
function skipped(reason: BrainSkipReason, excludeIds: string[] = []): BrainAutoDJResult {
  return { songs: [], fromBrain: false, excludeIds, reason }
}

/**
 * Пробуем добрать треки из мозга. Возвращаем ISong из локального пула по external_id.
 * Несовпавшие external_id отдаём в excludeIds чтобы мозг их больше не предлагал.
 */
export async function tryBrainAutoDJ(opts: {
  queue: ISong[]
  current: ISong | null
  count: number
  poolByExternalId: Map<string, ISong>
  /** Сколько треков осталось ПОСЛЕ текущего. Именно это дозапрашивает волну. */
  remainingAfterCurrent: number
  waveSettings?: Record<string, unknown>
}): Promise<BrainAutoDJResult> {
  // Порядок важен: сначала различаем «настройки нет» и «право отобрано флагом».
  if (!isBrainConfigured()) return skipped('off')
  if (!isBrainActive()) return skipped(getBrainMode() === 'local' ? 'mode-local' : 'off')
  try {
    // Раньше сюда передавался opts.queue.length в оба аргумента, то есть
    // waveNeedsRefill проверял queueLength <= 5. При очереди длиннее 5 треков
    // мозг не вызывался ВООБЩЕ — brain был мёртвым кодом в авто-миксе.
    if (!waveNeedsRefill(opts.queue.length, opts.remainingAfterCurrent)) {
      return skipped('not-refill')
    }
    const res = await waveContinue({
      queue: opts.queue.map((s) => s.id),
      currentTrackId: opts.current?.id ?? null,
      count: Math.min(20, Math.max(10, opts.count)),
      settings: mapWaveSettings(opts.waveSettings ?? {}),
      excludeIds: [...missingCache],
      // Поведенческий контекст: мозг учтёт свежие скипы/завершения при докрутке
      recentEvents: getRecentBrainEvents(),
    })
    if (!res || res.tracks.length === 0) return skipped('no-tracks')
    const songs: ISong[] = []
    const excludeIds: string[] = []
    const seenKeys = new Set(opts.queue.map(songKey))
    if (opts.current) seenKeys.add(songKey(opts.current))
    for (const t of res.tracks) {
      const ext = t.external_id || t.track_id
      const local = opts.poolByExternalId.get(ext) ?? opts.poolByExternalId.get(t.track_id)
      if (local) {
        // Дедуп и по id, и по «артист — название»: одна песня под двумя
        // row id не должна попасть в очередь дважды.
        if (songs.some((s) => s.id === local.id)) continue
        const k = songKey(local)
        if (seenKeys.has(k)) continue
        seenKeys.add(k)
        songs.push(local)
      }
      else excludeIds.push(ext)
      if (songs.length >= opts.count) break
    }
    if (excludeIds.length > 0) noteBrainMissing(excludeIds)
    if (songs.length === 0) return skipped('unmatched', excludeIds)
    return { songs, fromBrain: true, excludeIds, reason: null }
  } catch {
    return skipped('error')
  }
}

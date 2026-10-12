/**
 * KumaFlow — автосинк вкусов десктопа в мозг.
 * Вкл по умолчанию, если мозг добавлен (brain.store.autoSync, дефолт true).
 * Первый прогон вскоре после старта (user_id мозга поднимает brain-bootstrap),
 * дальше каждые 30 минут. Пока мозг не поднят — повторяем через минуту, а не
 * через полчаса: раньше один неудачный прогон «съедал» весь интервал.
 * Всё best-effort и тихо: без тостов, только console.
 */

import { isBrainActive, useBrainStore } from '@/store/brain.store'
import { ensureBrainReady } from './brain-bootstrap'
import { buildTasteSyncPayload, pullServerTaste, syncFromMobile } from './brain-sync'

const FIRST_DELAY_MS = 20_000
const INTERVAL_MS = 30 * 60_000
/** Мозг ещё не поднят (нет user_id/логина) — пробуем раньше, чем через полчаса. */
const NOT_READY_RETRY_MS = 60_000

let started = false
let running = false
let timer: ReturnType<typeof setTimeout> | null = null

/** Один прогон автосинка. Возвращает true если вкусы реально долетели. */
export async function runBrainAutoSync(reason: string): Promise<boolean> {
  if (running) return false
  if (!isBrainActive()) return false
  try {
    if (useBrainStore.getState().autoSync === false) return false
  } catch {
    return false
  }
  running = true
  try {
    // user_id поднимает brain-bootstrap (он же знает логин Navidrome).
    // Здесь только ждём его — раньше этот шаг жил здесь же, и без него весь
    // автосинк молчал до ручной кнопки в настройках.
    // Детали причины bootstrap уже пишет (и не чаще раза в конфиг).
    const uid = await ensureBrainReady()
    if (!uid) {
      console.log('[BrainAutoSync] мозг не поднят (user_id/логин) — пропускаем прогон')
      return false
    }
    // Сначала забираем серверные вкусы (баны/лайки/дизлайки) в локальный
    // профиль — иначе свежий логин играет заблокированное до первого пуша.
    // Union-мерж, best-effort: не блокируем пуш при ошибке.
    try {
      await pullServerTaste()
    } catch {
      /* тихо */
    }
    const { ratings, profile } = buildTasteSyncPayload()
    const res = await syncFromMobile(ratings, profile, [])
    if (!res || res.ok === false) {
      console.warn('[BrainAutoSync] sync failed (null/false) — проверь токен (нужен скоуп sync) и user_id')
      return false
    }
    console.log(`[BrainAutoSync] ok (${reason}): fav+${res.fav_added ?? 0}, source=${res.source ?? '?'}`)
    return true
  } catch (e) {
    console.warn('[BrainAutoSync] error:', e)
    return false
  } finally {
    running = false
  }
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    tick('timer').catch(() => undefined)
  }, ms)
}

async function tick(reason: string): Promise<void> {
  // Мозг выключен или автосинк выключен тумблером — просто ждём следующего цикла.
  let autoSyncOn = false
  try {
    autoSyncOn = isBrainActive() && useBrainStore.getState().autoSync !== false
  } catch {
    autoSyncOn = false
  }
  if (!autoSyncOn) {
    schedule(INTERVAL_MS)
    return
  }
  const ok = await runBrainAutoSync(reason)
  schedule(ok ? INTERVAL_MS : NOT_READY_RETRY_MS)
}

export function startBrainAutoSyncLoop(): void {
  if (started) return
  started = true
  schedule(FIRST_DELAY_MS)
}

/**
 * KumaFlow — автосинк вкусов десктопа в мозг.
 * Вкл по умолчанию, если мозг добавлен (brain.store.autoSync, дефолт true).
 * Первый прогон через ~90с после старта (сторы успевают гидратиться),
 * дальше каждые 30 минут. Всё best-effort и тихо: без тостов, только console.
 */

import { isBrainActive, useBrainStore } from '@/store/brain.store'
import {
  buildTasteSyncPayload,
  ensureBrainUserId,
  resolveNavidromeUsername,
  syncFromMobile,
} from './brain-sync'

const FIRST_DELAY_MS = 90_000
const INTERVAL_MS = 30 * 60_000

let started = false
let running = false
let timer: ReturnType<typeof setInterval> | null = null

/** Один прогон автосинка. Возвращает true если вкусы реально долетели. */
export async function runBrainAutoSync(reason: string): Promise<boolean> {
  if (running) return false
  if (!isBrainActive()) return false
  try {
    if (useBrainStore.getState().autoSync === false) return false
  } catch {
    return false
  }
  const username = resolveNavidromeUsername()
  if (!username) return false
  running = true
  try {
    const uid = await ensureBrainUserId(username, username)
    if (!uid) {
      console.warn('[BrainAutoSync] no user_id, skip')
      return false
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

export function startBrainAutoSyncLoop(): void {
  if (started) return
  started = true
  setTimeout(() => { void runBrainAutoSync('startup') }, FIRST_DELAY_MS)
  if (!timer) {
    timer = setInterval(() => { void runBrainAutoSync('interval') }, INTERVAL_MS)
  }
}

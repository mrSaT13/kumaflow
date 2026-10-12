/**
 * KumaFlow 1.7.3 — Bootstrap мозга (user_id).
 *
 * Раньше user_id мозга появлялся ТОЛЬКО из двух мест: автосинк (через 90с после
 * старта) и кнопка «Синхронизировать сейчас» в настройках. Все остальные вызовы
 * мозга начинаются с `if (!userId) return`, поэтому живая очередь (publish),
 * события, общие пилюли волны и «Продолжить с …» молчали до тех пор, пока
 * пользователь не откроет настройки. Отсюда «синк с сервером работает только
 * если настройки открыты».
 *
 * Здесь user_id поднимается автоматически: на старте, при включении/смене URL
 * мозга и когда ещё не поднят логин Navidrome. Всё тихо и best-effort.
 */

import { isBrainActive, useBrainStore } from '@/store/brain.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useAppStore } from '@/store/app.store'
import { ensureBrainUserId, resolveNavidromeUsername } from './brain-sync'

const FIRST_DELAY_MS = 3_000
const RETRY_MS = 15_000

let started = false
let retryTimer: ReturnType<typeof setInterval> | null = null
let inFlight: Promise<string | null> | null = null

/** Конфигурация, под которую поднимали user_id. Сменилась — поднимаем заново. */
function configKey(): string {
  const s = useBrainStore.getState()
  return `${s.enabled}|${s.baseUrl}`
}

let provisionedKey = ''
/** Один и тот же провал не пишем в консоль каждые 15 секунд. */
let warnedKey = ''

function warnOnce(key: string, message: string): void {
  if (warnedKey === key) return
  warnedKey = key
  console.warn(`[BrainBootstrap] ${message}`)
}

/**
 * Поднять user_id мозга. Идемпотентно, параллельные вызовы дедупятся.
 * null = мозг выключен/не настроен либо логина Navidrome ещё нет.
 */
export function ensureBrainReady(): Promise<string | null> {
  if (!isBrainActive()) return Promise.resolve(null)
  const known = useBrainStore.getState().userId
  if (known) return Promise.resolve(known)
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const username = resolveNavidromeUsername()
      // Логин Navidrome ещё не подняли — это не ошибка, вернёмся на следующем тике.
      if (!username) {
        warnOnce('no-username', 'ждём логин Navidrome')
        return null
      }
      const uid = await ensureBrainUserId(username, username)
      if (!uid) {
        // Обычно = Bearer-токен без админ-скоупа (создание юзера) или неверный URL.
        warnOnce(configKey(), 'мозг не дал user_id — проверить Bearer-токен (admin/sync) и URL')
        return null
      }
      provisionedKey = configKey()
      warnedKey = ''
      console.log(`[BrainBootstrap] user_id мозга готов: ${uid}`)
      // user_id только что появился — вкусы можно синхронить, не дожидаясь
      // получасового цикла автосинка.
      import('./brain-autosync')
        .then((m) => m.runBrainAutoSync('bootstrap'))
        .catch(() => undefined)
      return uid
    } catch (e) {
      console.warn('[BrainBootstrap] ошибка:', e)
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Тихий вызов из горячих путей (publish/события): не ждём, просто поднимаем. */
export function requestBrainReady(): void {
  if (!isBrainActive()) return
  if (useBrainStore.getState().userId) return
  ensureBrainReady().catch(() => undefined)
}

function stopRetry(): void {
  if (retryTimer) {
    clearInterval(retryTimer)
    retryTimer = null
  }
}

function startRetry(): void {
  if (retryTimer) return
  retryTimer = setInterval(() => {
    if (!isBrainActive()) return
    // Подняли — таймер больше не нужен, конфиг переподнимется по подписке.
    if (useBrainStore.getState().userId && provisionedKey === configKey()) {
      stopRetry()
      return
    }
    ensureBrainReady().catch(() => undefined)
  }, RETRY_MS)
}

/** Поднять user_id при старте и реактивно (включил мозг / сменил логин). */
export function startBrainBootstrapLoop(): void {
  if (started) return
  started = true

  setTimeout(() => {
    ensureBrainReady().catch(() => undefined)
    startRetry()
  }, FIRST_DELAY_MS)

  // Включил мозг или сменил URL/токен — user_id нужен сразу, а не на следующем тике.
  const unsubBrain = useBrainStore.subscribe((s, prev) => {
    if (s.enabled === prev.enabled && s.baseUrl === prev.baseUrl && s.token === prev.token) return
    if (!isBrainActive()) {
      stopRetry()
      return
    }
    // Сменился сервер или токен — прежний user_id от старого мозга не подходит
    // (иначе publish/sync уходили бы в 404 на новом сервере).
    if (s.baseUrl !== prev.baseUrl || s.token !== prev.token) {
      useBrainStore.getState().setUserId(null)
    }
    provisionedKey = ''
    ensureBrainReady().catch(() => undefined)
    startRetry()
  })

  // Логин Navidrome появился/сменился (мультиаккаунты) — перепривязываем мозг:
  // user_id мозга привязан к external_id = логину, поэтому меняем его, а не ждём.
  const rebind = () => {
    if (!isBrainActive()) return
    provisionedKey = ''
    useBrainStore.getState().setUserId(null)
    ensureBrainReady().catch(() => undefined)
    startRetry()
  }

  const unsubApp = useAppStore.subscribe((s) => s.data?.username ?? '', rebind)

  const unsubAccounts = useAccountsStore.subscribe(
    (s) => `${s.currentAccountId}|${s.accounts.map((a) => a.username).join(',')}`,
    rebind,
  )

  // Таймеры живут весь сеанс приложения — отписка только на выгрузке модуля.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      stopRetry()
      unsubBrain()
      unsubApp()
      unsubAccounts()
    })
  }
}

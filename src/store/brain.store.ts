/**
 * KumaFlow 1.6.2 — Brain store
 * Тумблер + URL + Bearer-токен (BRAIN_API_TOKEN). По умолчанию ВЫКЛ.
 */

import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'

/**
 * Кто принимает решение о выдаче.
 *
 * 'brain'  — мозг решает там, куда он подключён (AutoDJ, «Моя волна»),
 *            локальный ML — на остальных поверхностях. Это то же поведение,
 *            что было до появления флага, поэтому он такой по умолчанию.
 * 'local'  — интеграция настроена, но решения принимает локальный ML.
 *            Нужен как честный A/B-рычаг: переключил и сравнил.
 */
export type BrainMode = 'brain' | 'local'

export interface BrainState {
  enabled: boolean
  /** 'brain' — мозг авторитетен, 'local' — решения принимает локальный ML. */
  mode: BrainMode
  baseUrl: string
  token: string
  userId: string | null
  profileVersion: number
  lastSyncAt: string | null
  lastPublishAt: string | null
  lastPublishOk: boolean | null
  lastPublishError: string | null
  /** Автосинк вкусов в фоне (вкл по умолчанию, если мозг добавлен). */
  autoSync: boolean
  setEnabled: (v: boolean) => void
  setMode: (v: BrainMode) => void
  setBaseUrl: (v: string) => void
  setToken: (v: string) => void
  setUserId: (v: string | null) => void
  setProfileVersion: (v: number) => void
  setLastSyncAt: (v: string | null) => void
  setLastPublish: (at: string | null, ok: boolean | null, err: string | null) => void
  setAutoSync: (v: boolean) => void
}

export const useBrainStore = createWithEqualityFn<BrainState>()(
  persist(
    devtools(
      immer((set) => ({
        enabled: false,
        mode: 'brain',
        baseUrl: '',
        token: '',
        userId: null,
        profileVersion: 0,
        lastSyncAt: null,
        lastPublishAt: null,
        lastPublishOk: null,
        lastPublishError: null,
        autoSync: true,
        setEnabled: (v) => set((s) => { s.enabled = v }),
        setMode: (v) => set((s) => { s.mode = v }),
        setBaseUrl: (v) => set((s) => { s.baseUrl = v.trim() }),
        setToken: (v) => set((s) => { s.token = v.trim() }),
        setUserId: (v) => set((s) => { s.userId = v }),
        setProfileVersion: (v) => set((s) => { s.profileVersion = v }),
        setLastSyncAt: (v) => set((s) => { s.lastSyncAt = v }),
        setAutoSync: (v) => set((s) => { s.autoSync = v }),
        setLastPublish: (at, ok, err) => set((s) => {
          s.lastPublishAt = at
          s.lastPublishOk = ok
          s.lastPublishError = err
        }),
      })),
      { name: 'brain_store_dev' },
    ),
    {
      name: 'brain_store',
      version: 3,
      // mode появился в v3. В v2 поля не было, и поведение было ровно как при
      // mode === 'brain', поэтому для старых записей ставим 'brain', а не 'local':
      // иначе перезапуск молча откатил бы авторитет мозга.
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<BrainState>
        return { ...s, mode: s.mode === 'local' ? 'local' : 'brain' } as BrainState
      },
    },
  ),
)

/** Режим из localStorage. Читаем напрямую — минуя второй HMR-экземпляр модуля. */
export function getBrainMode(): BrainMode {
  try {
    const raw = localStorage.getItem('brain_store')
    if (!raw) return 'brain'
    const s = JSON.parse(raw)?.state ?? {}
    return s.mode === 'local' ? 'local' : 'brain'
  } catch {
    return 'brain'
  }
}

/**
 * Интеграция активна И мозгу отдано право решать.
 * mode === 'local' — настройка есть, но решения принимает локальный ML.
 */
export function isBrainActive(): boolean {
  try {
    const raw = localStorage.getItem('brain_store')
    if (!raw) return false
    const s = JSON.parse(raw)?.state ?? {}
    if (s.mode === 'local') return false
    return !!s.enabled && !!(s.baseUrl ?? '').trim()
  } catch {
    return false
  }
}

/** Интеграция настроена, даже если право решения отобрано флагом mode. */
export function isBrainConfigured(): boolean {
  try {
    const raw = localStorage.getItem('brain_store')
    if (!raw) return false
    const s = JSON.parse(raw)?.state ?? {}
    return !!s.enabled && !!(s.baseUrl ?? '').trim()
  } catch {
    return false
  }
}

/**
 * KumaFlow 1.6.2 — Brain store
 * Тумблер + URL + Bearer-токен (BRAIN_API_TOKEN). По умолчанию ВЫКЛ.
 */

import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'

export interface BrainState {
  enabled: boolean
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
    { name: 'brain_store', version: 2 },
  ),
)

export function isBrainActive(): boolean {
  try {
    const raw = localStorage.getItem('brain_store')
    if (!raw) return false
    const s = JSON.parse(raw)?.state ?? {}
    return !!s.enabled && !!(s.baseUrl ?? '').trim()
  } catch {
    return false
  }
}

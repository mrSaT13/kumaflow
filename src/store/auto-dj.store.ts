import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface AutoDJSettings {
  enabled: boolean
  itemCount: number // Сколько треков добавлять (1-50)
  timing: number // Когда срабатывать (осталось треков: 1-5)
  /**
   * Потолок длины очереди. Докладка идёт пачками по itemCount, а триггер
   * срабатывает на timing — при 25/2 очередь растёт на ~23 за цикл и
   * упирается в десятки треков (у меня висело 77 ≈ 4ч39м).
   *
   * Длинная очередь означает, что решение мозга, принятое час назад,
   * играется ещё три часа: смена пилюли, скип и дрейф доходят слишком
   * поздно. Короткая очередь = обратная связь видна за 2-3 трека, и
   * мозг успевает подстроиться.
   *
   * 0 = без потолка (прежнее поведение). 8-12 — рабочий диапазон.
   */
  queueCap: number
}

interface AutoDJStore {
  settings: AutoDJSettings

  // Actions
  setEnabled: (enabled: boolean) => void
  setItemCount: (count: number) => void
  setTiming: (timing: number) => void
  setQueueCap: (cap: number) => void
  toggleEnabled: () => void
}

const defaultSettings: AutoDJSettings = {
  enabled: false,
  itemCount: 25,
  timing: 2, // Срабатывать когда осталось 2 трека
  queueCap: 10,
}

export const useAutoDJStore = createWithEqualityFn<AutoDJStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          settings: defaultSettings,

          setEnabled: (enabled) => {
            set((state) => {
              state.settings.enabled = enabled
            })
          },

          setItemCount: (count) => {
            set((state) => {
              state.settings.itemCount = Math.max(1, Math.min(50, count))
            })
          },

          setTiming: (timing) => {
            set((state) => {
              state.settings.timing = Math.max(1, Math.min(5, timing))
            })
          },

          setQueueCap: (cap) => {
            set((state) => {
              // 0 — выключить потолок; иначе 3..50.
              state.settings.queueCap =
                cap === 0 ? 0 : Math.max(3, Math.min(50, Math.round(cap)))
            })
          },

          toggleEnabled: () => {
            set((state) => {
              state.settings.enabled = !state.settings.enabled
            })
          },
        })),
        {
          name: 'auto_dj_store',
        },
      ),
    ),
    {
      name: 'auto-dj-persistence',
      // Старые профили писались без queueCap — на merge приходит undefined,
      // и `cap > 0` молча превращалось в «потолок выключен». Восстанавливаем
      // дефолт явно.
      merge: (persisted, current) => {
        const p = (persisted as Partial<AutoDJStore>) ?? {}
        return {
          ...current,
          ...p,
          settings: {
            ...current.settings,
            ...(p.settings ?? {}),
            queueCap:
              typeof p.settings?.queueCap === 'number'
                ? p.settings.queueCap
                : current.settings.queueCap,
          },
        }
      },
      storage: {
        getItem: async (name) => {
          const item = localStorage.getItem(name)
          return item ? JSON.parse(item) : null
        },
        setItem: async (name, value) => {
          localStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: async (name) => {
          localStorage.removeItem(name)
        },
      },
    },
  ),
)

export const useAutoDJSettings = () => useAutoDJStore((state) => state.settings)
export const useAutoDJActions = () =>
  useAutoDJStore((state) => ({
    setEnabled: state.setEnabled,
    setItemCount: state.setItemCount,
    setTiming: state.setTiming,
    setQueueCap: state.setQueueCap,
    toggleEnabled: state.toggleEnabled,
  }))

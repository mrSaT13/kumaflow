import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface AutoDJSettings {
  enabled: boolean
  itemCount: number      // Сколько треков добавлять (1-50)
  timing: number         // Когда срабатывать (осталось треков: 1-5)
}

interface AutoDJStore {
  settings: AutoDJSettings
  
  // Actions
  setEnabled: (enabled: boolean) => void
  setItemCount: (count: number) => void
  setTiming: (timing: number) => void
  toggleEnabled: () => void
}

const defaultSettings: AutoDJSettings = {
  enabled: false,
  itemCount: 25,
  timing: 2,  // Срабатывать когда осталось 2 трека
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
export const useAutoDJActions = () => useAutoDJStore((state) => ({
  setEnabled: state.setEnabled,
  setItemCount: state.setItemCount,
  setTiming: state.setTiming,
  toggleEnabled: state.toggleEnabled,
}))

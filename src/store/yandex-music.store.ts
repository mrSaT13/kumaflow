import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface YandexMusicSettings {
  yandexMusicEnabled: boolean
  yandexMusicToken: string // x_token от Яндекс
  yandexMusicLogin: string // Логин для отображения
}

interface YandexMusicStore {
  settings: YandexMusicSettings

  // Actions
  setYandexMusicEnabled: (enabled: boolean) => void
  setYandexMusicToken: (token: string) => void
  setYandexMusicLogin: (login: string) => void
  clearCredentials: () => void
}

const defaultSettings: YandexMusicSettings = {
  yandexMusicEnabled: false,
  yandexMusicToken: '',
  yandexMusicLogin: '',
}

export const useYandexMusicStore = createWithEqualityFn<YandexMusicStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          settings: defaultSettings,

          setYandexMusicEnabled: (enabled: boolean) => {
            set((state) => {
              state.settings.yandexMusicEnabled = enabled
            })
          },

          setYandexMusicToken: (token: string) => {
            set((state) => {
              state.settings.yandexMusicToken = token.trim()
              if (token.trim()) {
                state.settings.yandexMusicEnabled = true
              }
            })
          },

          setYandexMusicLogin: (login: string) => {
            set((state) => {
              state.settings.yandexMusicLogin = login.trim()
            })
          },

          clearCredentials: () => {
            set((state) => {
              state.settings.yandexMusicToken = ''
              state.settings.yandexMusicLogin = ''
              state.settings.yandexMusicEnabled = false
            })
          },
        })),
        {
          name: 'yandex_music_store',
        },
      ),
    ),
    {
      name: 'yandex-music-settings',
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

export const useYandexMusic = () => useYandexMusicStore((state) => state)

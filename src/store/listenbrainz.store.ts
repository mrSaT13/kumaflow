import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'
import { listenBrainzApi } from '@/service/listenbrainz-api'

interface ListenBrainzStore {
  enabled: boolean
  token: string | null
  userName: string | null
  isAuthenticated: boolean

  // Actions
  setEnabled: (enabled: boolean) => void
  setToken: (token: string, userName?: string) => void
  clearToken: () => void
  validateToken: () => Promise<boolean>
  initialize: () => void
}

export const useListenBrainzStore = createWithEqualityFn<ListenBrainzStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          enabled: false,
          token: null,
          userName: null,
          isAuthenticated: false,

          setEnabled: (enabled) => {
            set((state) => {
              state.enabled = enabled
            })
          },

          setToken: (token, userName) => {
            listenBrainzApi.setToken(token, userName)
            set((state) => {
              state.token = token
              state.userName = userName || null
              state.isAuthenticated = true
              state.enabled = true
            })
          },

          clearToken: () => {
            listenBrainzApi.clearToken()
            set((state) => {
              state.token = null
              state.userName = null
              state.isAuthenticated = false
              state.enabled = false
            })
          },

          validateToken: async () => {
            const { token } = get()
            if (!token) return false

            const isValid = await listenBrainzApi.validateToken()
            set((state) => {
              state.isAuthenticated = isValid
            })
            return isValid
          },

          initialize: () => {
            listenBrainzApi.init()
            const token = listenBrainzApi.getToken()
            const userName = listenBrainzApi.getUserName()
            
            set((state) => {
              state.token = token
              state.userName = userName
              state.isAuthenticated = token !== null
              state.enabled = token !== null
            })
          },
        })),
        {
          name: 'listenbrainz_store',
        },
      ),
    ),
    {
      name: 'listenbrainz-persistence',
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
      // Не сохраняем token в localStorage (он уже сохраняется в service)
      partialize: (state) => ({
        enabled: state.enabled,
        userName: state.userName,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

export const useListenBrainz = () => useListenBrainzStore((state) => state)

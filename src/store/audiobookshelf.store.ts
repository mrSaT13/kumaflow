import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface AudiobookshelfConfig {
  enabled: boolean
  url: string
  apiKey: string
  isConnected: boolean
  lastSync?: string
}

interface AudiobookshelfStore {
  config: AudiobookshelfConfig
  
  // Actions
  setEnabled: (enabled: boolean) => void
  setUrl: (url: string) => void
  setApiKey: (apiKey: string) => void
  setConnected: (connected: boolean) => void
  setLastSync: (date: string) => void
  resetConfig: () => void
  
  // Test connection
  testConnection: () => Promise<boolean>
}

const defaultConfig: AudiobookshelfConfig = {
  enabled: false,
  url: '',
  apiKey: '',
  isConnected: false,
}

export const useAudiobookshelfStore = createWithEqualityFn<AudiobookshelfStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          config: defaultConfig,

          setEnabled: (enabled: boolean) => {
            set((state) => {
              state.config.enabled = enabled
            })
          },

          setUrl: (url: string) => {
            set((state) => {
              state.config.url = url.trim()
            })
          },

          setApiKey: (apiKey: string) => {
            set((state) => {
              state.config.apiKey = apiKey.trim()
            })
          },

          setConnected: (connected: boolean) => {
            set((state) => {
              state.config.isConnected = connected
            })
          },

          setLastSync: (date: string) => {
            set((state) => {
              state.config.lastSync = date
            })
          },

          resetConfig: () => {
            set({
              config: defaultConfig,
            })
          },

          testConnection: async () => {
            const { config } = get()

            if (!config.url || !config.apiKey) {
              return false
            }

            try {
              const baseUrl = config.url.replace(/\/$/, '')
              const url = `${baseUrl}/api/libraries`

              // В Electron используем IPC через window.api
              const win = window as any
              if (win.api && win.api.audiobookshelfRequest) {
                await win.api.audiobookshelfRequest(url, 'GET', undefined, config.apiKey)
                set((state) => {
                  state.config.isConnected = true
                })
                return true
              }

              // В веб-версии или если IPC недоступен - прямой запрос
              const response = await fetch(url, {
                headers: {
                  'Authorization': `Bearer ${config.apiKey}`,
                },
              })

              const isConnected = response.status === 200
              set((state) => {
                state.config.isConnected = isConnected
              })

              return isConnected
            } catch (error) {
              console.error('[Audiobookshelf] Connection test failed:', error)
              set((state) => {
                state.config.isConnected = false
              })
              return false
            }
          },
        })),
        {
          name: 'audiobookshelf_store',
        },
      ),
    ),
    {
      name: 'audiobookshelf-persistence',
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

export const useAudiobookshelf = () => useAudiobookshelfStore((state) => state)

import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'
import { lastFmService } from '@/service/lastfm-api'
import { fanartService } from '@/service/fanart-api'
import { discogsService } from '@/service/discogs-api'
import { appleMusicService, type CountryCode } from '@/service/apple-music-api'

export interface ExternalApiSettings {
  // Last.fm
  lastFmApiKey: string
  lastFmApiSecret: string
  lastFmEnabled: boolean

  // Fanart.tv
  fanartApiKey: string
  fanartClientKey: string // Personal API key (опционально)
  fanartEnabled: boolean
  fanartShowBanner: boolean // Показывать баннер артиста

  // Discogs
  discogsConsumerKey: string
  discogsConsumerSecret: string
  discogsToken: string
  discogsTokenSecret: string
  discogsEnabled: boolean

  // Apple Music
  appleMusicEnabled: boolean
  appleMusicCountry: CountryCode // Страна для локализации
}

interface ExternalApiStore {
  settings: ExternalApiSettings

  // Actions
  setLastFmApiKey: (key: string) => void
  setLastFmApiSecret: (secret: string) => void
  setLastFmEnabled: (enabled: boolean) => void
  setFanartApiKey: (key: string) => void
  setFanartClientKey: (key: string) => void
  setFanartEnabled: (enabled: boolean) => void
  setFanartShowBanner: (enabled: boolean) => void
  
  // Discogs Actions
  setDiscogsConsumerKey: (key: string) => void
  setDiscogsConsumerSecret: (secret: string) => void
  setDiscogsToken: (token: string) => void
  setDiscogsTokenSecret: (secret: string) => void
  setDiscogsEnabled: (enabled: boolean) => void

  // Apple Music Actions
  setAppleMusicEnabled: (enabled: boolean) => void
  setAppleMusicCountry: (country: CountryCode) => void

  resetSettings: () => void

  // Initialize services
  initializeServices: () => void
}

const defaultSettings: ExternalApiSettings = {
  lastFmApiKey: '',
  lastFmApiSecret: '',
  lastFmEnabled: false,
  fanartApiKey: '',
  fanartClientKey: '',
  fanartEnabled: false,
  fanartShowBanner: false, // По умолчанию выключено
  discogsConsumerKey: '',
  discogsConsumerSecret: '',
  discogsToken: '',
  discogsTokenSecret: '',
  discogsEnabled: false,
  appleMusicEnabled: false,
  appleMusicCountry: 'RU', // Россия по умолчанию
}

export const useExternalApiStore = createWithEqualityFn<ExternalApiStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          settings: defaultSettings,
          
          // Вызываем инициализацию сервисов при загрузке
          // Это важно для Last.fm и других сервисов
          _initialized: false,

          setLastFmApiKey: (key: string) => {
            set((state) => {
              state.settings.lastFmApiKey = key.trim()
              // Автоматически включаем если ключ добавлен
              if (key.trim()) {
                state.settings.lastFmEnabled = true
              }
            })
            // Переинициализируем сервис
            get().initializeServices()
          },

          setLastFmApiSecret: (secret: string) => {
            set((state) => {
              state.settings.lastFmApiSecret = secret.trim()
            })
            get().initializeServices()
          },

          setLastFmEnabled: (enabled: boolean) => {
            set((state) => {
              state.settings.lastFmEnabled = enabled
            })
            get().initializeServices()
          },

          setFanartApiKey: (key: string) => {
            set((state) => {
              state.settings.fanartApiKey = key.trim()
              // Автоматически включаем если ключ добавлен
              if (key.trim()) {
                state.settings.fanartEnabled = true
              }
            })
            // Переинициализируем сервис
            get().initializeServices()
          },

          setFanartClientKey: (key: string) => {
            set((state) => {
              state.settings.fanartClientKey = key.trim()
            })
            // Переинициализируем сервис
            get().initializeServices()
          },

          setFanartEnabled: (enabled: boolean) => {
            set((state) => {
              state.settings.fanartEnabled = enabled
            })
            get().initializeServices()
          },

          setFanartShowBanner: (enabled: boolean) => {
            set((state) => {
              state.settings.fanartShowBanner = enabled
            })
          },

          // Discogs
          setDiscogsConsumerKey: (key: string) => {
            set((state) => {
              state.settings.discogsConsumerKey = key.trim()
            })
            get().initializeServices()
          },

          setDiscogsConsumerSecret: (secret: string) => {
            set((state) => {
              state.settings.discogsConsumerSecret = secret.trim()
            })
            get().initializeServices()
          },

          setDiscogsToken: (token: string) => {
            set((state) => {
              state.settings.discogsToken = token.trim()
            })
            get().initializeServices()
          },

          setDiscogsTokenSecret: (secret: string) => {
            set((state) => {
              state.settings.discogsTokenSecret = secret.trim()
            })
            get().initializeServices()
          },

          setDiscogsEnabled: (enabled: boolean) => {
            set((state) => {
              state.settings.discogsEnabled = enabled
            })
            get().initializeServices()
          },

          // Apple Music
          setAppleMusicEnabled: (enabled: boolean) => {
            set((state) => {
              state.settings.appleMusicEnabled = enabled
            })
            get().initializeServices()
          },

          setAppleMusicCountry: (country: CountryCode) => {
            set((state) => {
              state.settings.appleMusicCountry = country
            })
            // Обновляем страну в сервисе
            appleMusicService.setCountry(country)
          },

          resetSettings: () => {
            set({
              settings: defaultSettings,
            })
            // Деинициализируем сервисы
            lastFmService.initialize('', '')
            fanartService.initialize('')
            discogsService.initialize('', '', '', '')
          },

          initializeServices: () => {
            const { settings } = get()

            console.log('[ExternalAPI] Initializing services...', {
              lastFmEnabled: settings.lastFmEnabled,
              lastFmApiKey: settings.lastFmApiKey ? '***' + settings.lastFmApiKey.slice(-8) : 'none',
              lastFmApiSecret: settings.lastFmApiSecret ? '***' + settings.lastFmApiSecret.slice(-8) : 'none',
            })

            // Инициализация Last.fm
            if (settings.lastFmEnabled && settings.lastFmApiKey && settings.lastFmApiSecret) {
              lastFmService.initialize(settings.lastFmApiKey, settings.lastFmApiSecret)

              // Загружаем session key из localStorage
              const sessionKey = localStorage.getItem('lastfm_session_key')
              if (sessionKey) {
                lastFmService.setSessionKey(sessionKey)
                console.log('[ExternalAPI] ✅ Last.fm session key loaded:', sessionKey.substring(0, 8) + '...')
              } else {
                console.log('[ExternalAPI] ⚠️ Last.fm session key not found in localStorage')
              }

              console.log('[ExternalAPI] ✅ Last.fm service initialized')
            } else {
              lastFmService.initialize('', '')
              console.log('[ExternalAPI] ℹ️ Last.fm service disabled or incomplete credentials')
            }

            // Инициализация Fanart.tv
            if (settings.fanartEnabled && settings.fanartApiKey) {
              fanartService.initialize(settings.fanartApiKey, settings.fanartClientKey)
              console.log('[ExternalAPI] Fanart.tv service initialized (v3.2)')
            } else {
              fanartService.initialize('', '')
              console.log('[ExternalAPI] Fanart.tv service disabled')
            }

            // Инициализация Discogs
            if (settings.discogsEnabled && settings.discogsConsumerKey && settings.discogsConsumerSecret) {
              discogsService.initialize(
                settings.discogsConsumerKey,
                settings.discogsConsumerSecret,
                settings.discogsToken,
                settings.discogsTokenSecret
              )
              console.log('[ExternalAPI] Discogs service initialized')
            } else {
              discogsService.initialize('', '', '', '')
              console.log('[ExternalAPI] Discogs service disabled')
            }

            // Инициализация Apple Music
            if (settings.appleMusicEnabled) {
              appleMusicService.setCountry(settings.appleMusicCountry)
              console.log(`[ExternalAPI] Apple Music service enabled (country: ${settings.appleMusicCountry})`)
            } else {
              console.log('[ExternalAPI] Apple Music service disabled')
            }
          },
        })),
        {
          name: 'external_api_store',
        },
      ),
    ),
    {
      name: 'external-api-settings',
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
      // Инициализируем сервисы при загрузке из localStorage
      onRestore: (state) => {
        console.log('[ExternalAPI] 🔄 Restoring state from localStorage...')
        if (state?.settings) {
          // Инициализируем сервисы с сохранёнными настройками СРАЗУ
          // Важно: используем requestIdleCallback или микрозадачу для асинхронности
          queueMicrotask(() => {
            console.log('[ExternalAPI] Calling initializeServices...')
            useExternalApiStore.getState().initializeServices()
          })
        }
      },
    },
  ),
)

export const useExternalApi = () => useExternalApiStore((state) => state)

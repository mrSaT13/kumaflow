import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'
import type { MABConfig, MABStats } from '@/service/multi-armed-bandit'

export interface MLPlaylistSettings {
  enabled: boolean
  minTracks: number
  maxTracks: number
  autoUpdateHours: number
  removeDuplicates: boolean
  scanLibrary: boolean
  scanProgress: number
  isScanning: boolean
  lastScanDate: string | null
  showLastUpdated: boolean  // Показывать дату обновления на карточках
  timeAdaptivity: boolean  // Адаптивность по времени суток (утром энергичнее, вечером спокойнее)
  discoveryEnabled: boolean  // 🔒 Тумблер "Включить открытия" (по умолчанию ВЫКЛ)
  noveltyFactor: number  // Коэффициент новизны (0-1) для многоруких бандитов (только если discoveryEnabled)
  mabEnabled: boolean  // 🔒 Тумблер Multi-Armed Bandit (по умолчанию ВКЛ)
  mabConfig: Partial<MABConfig>  // Настройки MAB (strategy, epsilon...)
  llmCoordinatorEnabled: boolean  // LLM Координатор для "Моя волна"
}

export interface MLPlaylist {
  id: string
  name: string
  description: string
  trackCount: number
  lastUpdated: string
  autoUpdate: boolean
  duplicateOf?: string
}

interface MLPlaylistsStore {
  settings: MLPlaylistSettings
  playlists: MLPlaylist[]

  // Actions
  setMinTracks: (min: number) => void
  setMaxTracks: (max: number) => void
  setAutoUpdateHours: (hours: number) => void
  setRemoveDuplicates: (enabled: boolean) => void
  setScanLibrary: (enabled: boolean) => void
  startScan: () => void
  stopScan: () => void
  setScanProgress: (progress: number) => void
  addPlaylist: (playlist: MLPlaylist) => void
  removePlaylist: (id: string) => void
  removeDuplicatePlaylists: () => void
  updatePlaylist: (id: string, updates: Partial<MLPlaylist>) => void
  resetSettings: () => void
  setShowLastUpdated: (enabled: boolean) => void
  setTimeAdaptivity: (enabled: boolean) => void
  setDiscoveryEnabled: (enabled: boolean) => void  // 🔒 Тумблер открытий
  setNoveltyFactor: (factor: number) => void
  setMabEnabled: (enabled: boolean) => Promise<void>  // 🔒 MAB тумблер (async)
  setMabConfig: (config: Partial<MABConfig>) => Promise<void>  // MAB настройки (async)
  resetMabStats: () => Promise<void>  // Сброс статистики MAB (async)
  getMabStats: () => Promise<MABStats | null>  // Получить статистику MAB (async)
  setLLMCoordinatorEnabled: (enabled: boolean) => void
  
  // 🆕 Рейтинг плейлистов для ML обратной связи
  playlistRatings: Record<string, { rating: number; timestamp: number }>  // playlistId -> {rating, timestamp}
  recordPlaylistRating: (playlistId: string, rating: number) => void
  getPlaylistRating: (playlistId: string) => number
}

const defaultSettings: MLPlaylistSettings = {
  enabled: true,
  minTracks: 25,
  maxTracks: 100,
  autoUpdateHours: 24,
  removeDuplicates: false,
  scanLibrary: false,
  scanProgress: 0,
  isScanning: false,
  lastScanDate: null,
  showLastUpdated: true,  // По умолчанию включено
  timeAdaptivity: true,  // По умолчанию включена адаптивность по времени суток
  discoveryEnabled: false,  // 🔒 По умолчанию ВЫКЛ — только проверенные артисты/жанры
  noveltyFactor: 0.2,  // 20% новой музыки (многорукие бандиты) — только если discoveryEnabled
  mabEnabled: true,  // 🔒 MAB по умолчанию ВКЛ — умное исследование
  mabConfig: {  // Дефолтные настройки MAB
    epsilon: 0.15,
    decayRate: 0.995,
    minEpsilon: 0.05,
    strategy: 'epsilon-greedy',
    contextEnabled: true,
    explorationBoostNewArms: 5.0,
  },
  llmCoordinatorEnabled: false,  // По умолчанию выключен
}

export const useMLPlaylistsStore = createWithEqualityFn<MLPlaylistsStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          settings: defaultSettings,
          playlists: [],

          setMinTracks: (min) => {
            set((state) => {
              state.settings.minTracks = min
            })
          },

          setMaxTracks: (max) => {
            set((state) => {
              state.settings.maxTracks = max
            })
          },

          setAutoUpdateHours: (hours) => {
            set((state) => {
              state.settings.autoUpdateHours = hours
            })
          },

          setRemoveDuplicates: (enabled) => {
            set((state) => {
              state.settings.removeDuplicates = enabled
            })
          },

          setScanLibrary: (enabled) => {
            set((state) => {
              state.settings.scanLibrary = enabled
            })
          },

          startScan: () => {
            set((state) => {
              state.settings.isScanning = true
              state.settings.scanProgress = 0
            })
          },

          stopScan: () => {
            set((state) => {
              state.settings.isScanning = false
              state.settings.lastScanDate = new Date().toISOString()
            })
          },

          setScanProgress: (progress) => {
            set((state) => {
              state.settings.scanProgress = progress
            })
          },

          addPlaylist: (playlist) => {
            set((state) => {
              state.playlists.push(playlist)
            })
          },

          removePlaylist: (id) => {
            set((state) => {
              state.playlists = state.playlists.filter((p) => p.id !== id)
            })
          },

          removeDuplicatePlaylists: () => {
            set((state) => {
              const duplicates = state.playlists.filter((p) => p.duplicateOf)
              duplicates.forEach((dup) => {
                state.playlists = state.playlists.filter((p) => p.id !== dup.id)
              })
            })
          },

          updatePlaylist: (id, updates) => {
            set((state) => {
              const index = state.playlists.findIndex((p) => p.id === id)
              if (index >= 0) {
                state.playlists[index] = {
                  ...state.playlists[index],
                  ...updates,
                }
              }
            })
          },

          resetSettings: () => {
            set({
              settings: defaultSettings,
            })
          },

          setShowLastUpdated: (enabled) => {
            set((state) => {
              state.settings.showLastUpdated = enabled
            })
          },

          setTimeAdaptivity: (enabled) => {
            set((state) => {
              state.settings.timeAdaptivity = enabled
            })
          },

          setDiscoveryEnabled: (enabled) => {
            set((state) => {
              state.settings.discoveryEnabled = enabled
              console.log(`[ML Playlists] 🔒 Discovery ${enabled ? 'ENABLED' : 'DISABLED'} — novelty will ${enabled ? 'use noveltyFactor' : 'be 0'}`)
            })
          },

          setNoveltyFactor: (factor) => {
            set((state) => {
              state.settings.noveltyFactor = Math.max(0, Math.min(1, factor))
            })
          },

          // 🔒 MAB Actions
          setMabEnabled: async (enabled) => {
            set((state) => {
              state.settings.mabEnabled = enabled
              console.log(`[ML Playlists] 🎰 MAB ${enabled ? 'ENABLED' : 'DISABLED'}`)
            })
            
            // Если включаем — применяем настройки
            if (enabled) {
              const state = get()
              if (state.settings.mabConfig) {
                const { multiArmedBandit } = await import('@/service/multi-armed-bandit')
                multiArmedBandit.updateConfig(state.settings.mabConfig)
              }
            }
          },

          setMabConfig: async (config) => {
            console.log('[ML Playlists] 🎰 setMabConfig called with:', config)
            
            // Сначала синхронное обновление state (чтобы UI обновился сразу)
            set((state) => {
              state.settings.mabConfig = { ...state.settings.mabConfig, ...config }
              console.log('[ML Playlists] 🎰 mabConfig after update:', state.settings.mabConfig)
            })
            
            // Потом async — применяем к MAB
            setTimeout(async () => {
              const state = get()
              console.log('[ML Playlists] 🎰 mabEnabled:', state.settings.mabEnabled)
              if (state.settings.mabEnabled) {
                const { multiArmedBandit } = await import('@/service/multi-armed-bandit')
                multiArmedBandit.updateConfig({ ...state.settings.mabConfig, ...config })
              }
            }, 0)
          },

          resetMabStats: async () => {
            const { multiArmedBandit } = await import('@/service/multi-armed-bandit')
            multiArmedBandit.reset()
            console.log('[ML Playlists] 🎰 MAB stats reset')
          },

          getMabStats: async () => {
            const { multiArmedBandit } = await import('@/service/multi-armed-bandit')
            return multiArmedBandit.getStats()
          },

          setLLMCoordinatorEnabled: (enabled) => {
            set((state) => {
              state.settings.llmCoordinatorEnabled = enabled
            })
          },

          // 🆕 Рейтинг плейлистов
          playlistRatings: {},  // Начальное состояние

          recordPlaylistRating: (playlistId, rating) => {
            set((state) => {
              state.playlistRatings[playlistId] = {
                rating,
                timestamp: Date.now(),
              }
              console.log(`[ML Playlists] 🆕 Recorded rating ${rating}/5 for playlist ${playlistId}`)
            })
          },

          getPlaylistRating: (playlistId) => {
            const state = useMLPlaylistsStore.getState()
            return state.playlistRatings[playlistId]?.rating || 0
          },
        })),
        {
          name: 'ml_playlists_store',
        },
      ),
    ),
    {
      name: 'ml-playlists-persistence',
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

export const useMLPlaylists = () => useMLPlaylistsStore((state) => state)

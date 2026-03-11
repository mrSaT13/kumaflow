import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

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

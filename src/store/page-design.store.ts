/**
 * Store для настроек дизайна страниц (артист, альбом, трек)
 */
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'

export interface PageDesignSettings {
  newArtistDesignEnabled: boolean    // Новый дизайн страницы артиста
  newAlbumDesignEnabled: boolean     // Новый дизайн страницы альбома
  newTrackDesignEnabled: boolean     // Новый дизайн страницы трека
}

interface PageDesignSettingsStore {
  settings: PageDesignSettings

  // Actions
  setNewArtistDesignEnabled: (enabled: boolean) => void
  setNewAlbumDesignEnabled: (enabled: boolean) => void
  setNewTrackDesignEnabled: (enabled: boolean) => void
  resetToDefaults: () => void
}

const defaultSettings: PageDesignSettings = {
  newArtistDesignEnabled: false,
  newAlbumDesignEnabled: false,
  newTrackDesignEnabled: false,
}

export const usePageDesignSettingsStore = createWithEqualityFn<PageDesignSettingsStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          settings: defaultSettings,

          setNewArtistDesignEnabled: (enabled) => {
            set((state) => {
              state.settings.newArtistDesignEnabled = enabled
            })
          },

          setNewAlbumDesignEnabled: (enabled) => {
            set((state) => {
              state.settings.newAlbumDesignEnabled = enabled
            })
          },

          setNewTrackDesignEnabled: (enabled) => {
            set((state) => {
              state.settings.newTrackDesignEnabled = enabled
            })
          },

          resetToDefaults: () => {
            set({ settings: defaultSettings })
          },
        })),
        {
          name: 'page_design_settings',
        },
      ),
    ),
    {
      name: 'page-design-settings-persistence',
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

export const usePageDesignSettings = () => usePageDesignSettingsStore((state) => state.settings)
export const usePageDesignSettingsActions = () => usePageDesignSettingsStore((state) => ({
  setNewArtistDesignEnabled: state.setNewArtistDesignEnabled,
  setNewAlbumDesignEnabled: state.setNewAlbumDesignEnabled,
  setNewTrackDesignEnabled: state.setNewTrackDesignEnabled,
  resetToDefaults: state.resetToDefaults,
}))

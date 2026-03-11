import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'

export type SectionType = 
  | 'recentlyPlayed'
  | 'mostPlayed'
  | 'recentlyAdded'
  | 'explore'
  | 'genres'
  | 'artistRadio'
  | 'newReleases'
  | 'globalCharts'

export interface HomepageSection {
  id: SectionType
  title: string
  enabled: boolean
  order: number
}

export interface HomepageSettings {
  sections: HomepageSection[]
}

interface HomepageSettingsStore {
  settings: HomepageSettings
  
  // Actions
  setSectionEnabled: (id: SectionType, enabled: boolean) => void
  setSectionOrder: (id: SectionType, order: number) => void
  resetToDefaults: () => void
}

const defaultSections: HomepageSection[] = [
  { id: 'genres', title: 'Жанры', enabled: true, order: 0 },
  { id: 'artistRadio', title: 'В стиле', enabled: true, order: 1 },
  { id: 'newReleases', title: 'Новинки подписок', enabled: true, order: 2 },
  { id: 'globalCharts', title: 'Global Charts', enabled: true, order: 3 },
  { id: 'recentlyPlayed', title: 'Недавно прослушанные', enabled: true, order: 4 },
  { id: 'mostPlayed', title: 'Наиболее прослушиваемые', enabled: true, order: 5 },
  { id: 'recentlyAdded', title: 'Недавно добавлено', enabled: true, order: 6 },
  { id: 'explore', title: 'Обзор', enabled: true, order: 7 },
]

const defaultSettings: HomepageSettings = {
  sections: defaultSections,
}

export const useHomepageSettingsStore = createWithEqualityFn<HomepageSettingsStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          settings: defaultSettings,

          setSectionEnabled: (id, enabled) => {
            set((state) => {
              const section = state.settings.sections.find(s => s.id === id)
              if (section) {
                section.enabled = enabled
              }
            })
          },

          setSectionOrder: (id, order) => {
            set((state) => {
              // Находим секцию и обновляем её order
              const section = state.settings.sections.find(s => s.id === id)
              if (section) {
                section.order = order
              }
              // Сортируем секции по order
              state.settings.sections.sort((a, b) => a.order - b.order)
            })
          },

          resetToDefaults: () => {
            set({ settings: defaultSettings })
          },
        })),
        {
          name: 'homepage_settings_store',
        },
      ),
    ),
    {
      name: 'homepage-settings-persistence',
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

export const useHomepageSettings = () => useHomepageSettingsStore((state) => state.settings)
export const useHomepageSettingsActions = () => useHomepageSettingsStore((state) => ({
  setSectionEnabled: state.setSectionEnabled,
  setSectionOrder: state.setSectionOrder,
  resetToDefaults: state.resetToDefaults,
}))

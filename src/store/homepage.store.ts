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

/**
 * Раскладка hero «Моя волна», три вида:
 *   v1 — KumaWave V1: иконка слева, живое пятно WaveBlob
 *   v2 — KumaWave V2: по центру, фон KumaWaveBackground (SVG + жанры)
 *   v3 — KumaWave V3: по центру, фон VibeWaveBackground (WebGL-шейдер,
 *        реагирует на музыку и на лайк/дизлайк)
 * Старые значения 'kuma'/'yandex'/'vibe' маппятся в withWaveDefaults.
 */
export type WaveHeroLayout = 'v1' | 'v2' | 'v3'

export type WaveMoodKey =
  | 'fire'
  | 'warp'
  | 'sparkle'
  | 'bounce'
  | 'smoke'
  | 'breath'
  | 'dust'
  | 'sun'
  | 'fireflies'
  | 'mist'

export interface WaveHeroSettings {
  /** Раскладка hero-карточки: наша, центрированная или шейдерная */
  layout: WaveHeroLayout
  /** Живая CSS-анимация пятна (transform only). false = статика */
  alive: boolean
  /** Танцующие полоски поверх капли */
  lines: boolean
  /** Ховер-секция на весь экран (виджеты поверх анимации) */
  expanded: boolean
  /** Эффекты по жанрам. Для слабых ПК гасятся по одному */
  effects: Record<WaveMoodKey, boolean>
}

export const DEFAULT_WAVE_EFFECTS: Record<WaveMoodKey, boolean> = {
  fire: true,
  warp: true,
  sparkle: true,
  bounce: true,
  smoke: true,
  breath: true,
  dust: true,
  sun: true,
  fireflies: true,
  mist: true,
}

/** Мерж поверх старых persisted-настроек, где новых полей может не быть. */
export function withWaveDefaults(partial?: Partial<WaveHeroSettings>): WaveHeroSettings {
  const { effects, layout, ...rest } = partial ?? {}
  // Миграция старых названий: kuma→v1, yandex→v2, vibe→v3.
  const legacy = layout as string | undefined
  const migrated: WaveHeroLayout =
    legacy === 'kuma' || legacy === 'v1' ? 'v1'
    : legacy === 'yandex' || legacy === 'v2' ? 'v2'
    : legacy === 'vibe' || legacy === 'v3' ? 'v3'
    : 'v1'
  return {
    alive: true,
    lines: true,
    expanded: false,
    ...rest,
    layout: migrated,
    effects: { ...DEFAULT_WAVE_EFFECTS, ...effects },
  }
}

export interface HomepageSettings {
  sections: HomepageSection[]
  newDesignEnabled: boolean  // 🆕 Feature Flag для нового дизайна
  waveHero: WaveHeroSettings  // 🌊 Hero «Моя волна»: раскладка + анимация
}

interface HomepageSettingsStore {
  settings: HomepageSettings

  // Actions
  setSectionEnabled: (id: SectionType, enabled: boolean) => void
  setSectionOrder: (ids: SectionType[]) => void  // Передаём массив ID в новом порядке
  setNewDesignEnabled: (enabled: boolean) => void  // 🆕 Переключатель нового дизайна
  setWaveHeroLayout: (layout: WaveHeroLayout) => void  // 🌊 Раскладка hero
  setWaveHeroAlive: (alive: boolean) => void  // 🌊 Живая анимация
  setWaveLines: (enabled: boolean) => void  // 🌊 Танцующие полоски
  setWaveExpanded: (expanded: boolean) => void  // 🌊 Секция на весь экран
  setWaveEffect: (mood: WaveMoodKey, enabled: boolean) => void  // 🌊 Эффект жанра
  resetToDefaults: () => void
}

const defaultSections: HomepageSection[] = [
  { id: 'genres', title: 'Жанры', enabled: true, order: 0 },
  { id: 'artistRadio', title: 'В стиле', enabled: true, order: 1 },
  { id: 'newReleases', title: 'Новинки подписок', enabled: true, order: 2 },
  { id: 'globalCharts', title: 'Мировые чарты', enabled: true, order: 3 },
  { id: 'recentlyPlayed', title: 'Недавно прослушанные', enabled: true, order: 4 },
  { id: 'mostPlayed', title: 'Наиболее прослушиваемые', enabled: true, order: 5 },
  { id: 'recentlyAdded', title: 'Недавно добавлено', enabled: true, order: 6 },
  { id: 'explore', title: 'Обзор', enabled: true, order: 7 },
]

const defaultSettings: HomepageSettings = {
  sections: defaultSections,
  newDesignEnabled: false,  // 🆕 По умолчанию старый дизайн
  waveHero: { layout: 'v1', alive: true, lines: true, expanded: false, effects: { ...DEFAULT_WAVE_EFFECTS } },
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

          setSectionOrder: (ids: SectionType[]) => {
            set((state) => {
              // Создаём новую карту порядков на основе переданных ID
              const orderMap = new Map<SectionType, number>()
              ids.forEach((id, index) => {
                orderMap.set(id, index)
              })
              
              // Обновляем order для каждой секции
              state.settings.sections.forEach((section) => {
                const newOrder = orderMap.get(section.id as SectionType)
                if (newOrder !== undefined) {
                  section.order = newOrder
                }
              })
              
              // Сортируем секции по order
              state.settings.sections.sort((a, b) => a.order - b.order)
            })
          },

          resetToDefaults: () => {
            set({ settings: defaultSettings })
          },

          // 🆕 Переключатель нового дизайна
          setNewDesignEnabled: (enabled) => {
            set((state) => {
              state.settings.newDesignEnabled = enabled
            })
          },

          // 🌊 Hero «Моя волна»
          setWaveHeroLayout: (layout) => {
            set((state) => {
              state.settings.waveHero = withWaveDefaults(state.settings.waveHero)
              state.settings.waveHero.layout = layout
            })
          },
          setWaveHeroAlive: (alive) => {
            set((state) => {
              state.settings.waveHero = withWaveDefaults(state.settings.waveHero)
              state.settings.waveHero.alive = alive
            })
          },
          setWaveLines: (enabled) => {
            set((state) => {
              state.settings.waveHero = withWaveDefaults(state.settings.waveHero)
              state.settings.waveHero.lines = enabled
            })
          },
          setWaveExpanded: (expanded) => {
            set((state) => {
              state.settings.waveHero = withWaveDefaults(state.settings.waveHero)
              state.settings.waveHero.expanded = expanded
            })
          },
          setWaveEffect: (mood, enabled) => {
            set((state) => {
              state.settings.waveHero = withWaveDefaults(state.settings.waveHero)
              state.settings.waveHero.effects[mood] = enabled
            })
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
  setNewDesignEnabled: state.setNewDesignEnabled,  // 🆕
  setWaveHeroLayout: state.setWaveHeroLayout,  // 🌊
  setWaveHeroAlive: state.setWaveHeroAlive,  // 🌊
  setWaveLines: state.setWaveLines,  // 🌊
  setWaveExpanded: state.setWaveExpanded,  // 🌊
  setWaveEffect: state.setWaveEffect,  // 🌊
  resetToDefaults: state.resetToDefaults,
}))

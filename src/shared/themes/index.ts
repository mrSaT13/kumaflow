/**
 * KumaFlow Theme Store
 * Управление темами в приложении
 */

import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { KumaFlowTheme, KUMAFLOW_THEMES } from './kumaflow-theme-types'
import { defaultDark } from './default-dark'
import { defaultLight } from './default-light'
import { dracula } from './dracula'
import { githubDark } from './github-dark'
import { nord } from './nord'
import { gruvboxDark } from './gruvbox-dark'
import { tokyoNight } from './tokyo-night'
import { catppuccinMocha } from './catppuccin-mocha'
import { monokai } from './monokai'
import { oneDark } from './one-dark'
import { rosePine } from './rose-pine'
import { shadesOfPurple } from './shades-of-purple'
import { solarizedDark } from './solarized-dark'
import { materialDark } from './material-dark'
import { nightOwl } from './night-owl'
import { ayuDark } from './ayu-dark'
import { glassyDark } from './glassy-dark'
import { highContrastDark } from './high-contrast-dark'
import { vscodeDark } from './vscode-dark'

// База данных тем
const THEME_DATABASE: Record<string, KumaFlowTheme> = {
  'default-dark': defaultDark,
  'default-light': defaultLight,
  'dracula': dracula,
  'github-dark': githubDark,
  'nord': nord,
  'gruvbox-dark': gruvboxDark,
  'tokyo-night': tokyoNight,
  'catppuccin-mocha': catppuccinMocha,
  'monokai': monokai,
  'one-dark': oneDark,
  'rose-pine': rosePine,
  'shades-of-purple': shadesOfPurple,
  'solarized-dark': solarizedDark,
  'material-dark': materialDark,
  'night-owl': nightOwl,
  'ayu-dark': ayuDark,
  'glassy-dark': glassyDark,
  'high-contrast-dark': highContrastDark,
  'vscode-dark': vscodeDark,
}

interface ThemeStore {
  currentThemeId: string
  currentTheme: KumaFlowTheme
  
  // Actions
  setTheme: (themeId: string) => void
  getTheme: (themeId: string) => KumaFlowTheme | undefined
  getAllThemes: () => KumaFlowTheme[]
  getDarkThemes: () => KumaFlowTheme[]
  getLightThemes: () => KumaFlowTheme[]
}

const defaultTheme = defaultDark

export const useThemeStore = createWithEqualityFn<ThemeStore>()(
  persist(
    devtools(
      immer((set, get) => ({
        currentThemeId: 'default-dark',
        currentTheme: defaultTheme,
        
        setTheme: (themeId: string) => {
          const theme = THEME_DATABASE[themeId]
          if (theme) {
            set((state) => {
              state.currentThemeId = themeId
              state.currentTheme = theme
            })
            console.log(`[Theme] Changed to: ${theme.name}`)
            
            // Применяем CSS переменные
            applyTheme(theme)
          } else {
            console.warn(`[Theme] Theme not found: ${themeId}`)
          }
        },
        
        getTheme: (themeId: string) => THEME_DATABASE[themeId],
        
        getAllThemes: () => Object.values(THEME_DATABASE),
        
        getDarkThemes: () => Object.values(THEME_DATABASE).filter(t => t.mode === 'dark'),
        
        getLightThemes: () => Object.values(THEME_DATABASE).filter(t => t.mode === 'light'),
      })),
      { name: 'theme_store' },
    ),
    {
      name: 'kumaflow-theme-persistence',
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

// Применение темы через CSS переменные
function applyTheme(theme: KumaFlowTheme) {
  const root = document.documentElement
  
  // Применяем цвета
  Object.entries(theme.colors).forEach(([key, value]) => {
    const cssVar = `--theme-${kebabCase(key)}`
    root.style.setProperty(cssVar, value)
  })
  
  // Применяем app настройки
  Object.entries(theme.app).forEach(([key, value]) => {
    const cssVar = `--theme-${kebabCase(key)}`
    root.style.setProperty(cssVar, value)
  })
  
  // Устанавливаем data-theme атрибут
  root.setAttribute('data-theme', theme.id)
  root.setAttribute('data-mode', theme.mode)
  
  console.log(`[Theme] Applied: ${theme.name} (${theme.mode})`)
}

// Утилита для преобразования в kebab-case
function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

// Хуки для удобства
export const useTheme = () => useThemeStore((state) => state.currentTheme)
export const useThemeActions = () => useThemeStore((state) => ({
  setTheme: state.setTheme,
  getTheme: state.getTheme,
}))
export const useAllThemes = () => useThemeStore((state) => state.getAllThemes())

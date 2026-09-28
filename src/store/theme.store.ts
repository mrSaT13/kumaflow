import merge from 'lodash/merge'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { IThemeContext, Theme } from '@/types/themeContext'
import { getValidThemeFromEnv } from '@/utils/theme'

const appThemeFromEnv = getValidThemeFromEnv()

// Polar — общая дефолтная тема из иконки (navy/steel/ice/glacier).
// Адаптив: первый запуск без сохранённой темы — по prefers-color-scheme.
function getSystemPolar(): Theme {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return Theme.PolarLight
    }
  } catch {
    // ignore — fallback ниже
  }
  return Theme.PolarDark
}

// Проверка на существование темы
function isValidTheme(theme: string): boolean {
  return Object.values(Theme).includes(theme as Theme)
}

export const useThemeStore = createWithEqualityFn<IThemeContext>()(
  subscribeWithSelector(
    persist(
      devtools(
        immer((set) => ({
          theme: appThemeFromEnv || getSystemPolar(),
          setTheme: (theme: Theme) => {
            set((state) => {
              state.theme = theme
            })
          },
          glassEnabled: true,
          glassBlur: 16,
          glassOpacity: 0.6,
          setGlassEnabled: (enabled: boolean) => {
            set((state) => {
              state.glassEnabled = enabled
            })
          },
          setGlassBlur: (blur: number) => {
            set((state) => {
              state.glassBlur = Math.min(24, Math.max(4, blur))
            })
          },
          setGlassOpacity: (opacity: number) => {
            set((state) => {
              state.glassOpacity = Math.min(0.9, Math.max(0.2, opacity))
            })
          },
        })),
        {
          name: 'theme_store',
        },
      ),
      {
        name: 'theme_store',
        version: 2,
        merge: (persistedState, currentState) => {
          if (appThemeFromEnv) {
            if (persistedState && typeof persistedState === 'object') {
              persistedState = {
                ...persistedState,
                theme: appThemeFromEnv,
              }
            }
          }

          // Проверяем валидность темы из localStorage
          if (persistedState && typeof persistedState === 'object' && 'theme' in persistedState) {
            if (!isValidTheme((persistedState as any).theme)) {
              return currentState
            }
          }

          return merge(currentState, persistedState)
        },
      },
    ),
  ),
)

export const useTheme = () => useThemeStore((state) => state)

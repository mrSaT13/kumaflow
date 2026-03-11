import merge from 'lodash/merge'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { IThemeContext, Theme } from '@/types/themeContext'
import { getValidThemeFromEnv } from '@/utils/theme'

const appThemeFromEnv = getValidThemeFromEnv()

// Проверка на существование темы
function isValidTheme(theme: string): boolean {
  return Object.values(Theme).includes(theme as Theme)
}

export const useThemeStore = createWithEqualityFn<IThemeContext>()(
  subscribeWithSelector(
    persist(
      devtools(
        immer((set) => ({
          theme: appThemeFromEnv || Theme.Dark,
          setTheme: (theme: Theme) => {
            set((state) => {
              state.theme = theme
            })
          },
        })),
        {
          name: 'theme_store',
        },
      ),
      {
        name: 'theme_store',
        version: 1,
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

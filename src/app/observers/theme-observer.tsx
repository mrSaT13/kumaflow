import { useLayoutEffect } from 'react'
import { useTheme } from '@/store/theme.store'
import { Theme } from '@/types/themeContext'
import { setDesktopTitleBarColors } from '@/utils/theme'

export const appThemes: Theme[] = Object.values(Theme)

export function ThemeObserver() {
  const { theme, glassEnabled, glassBlur, glassOpacity } = useTheme()

  useLayoutEffect(() => {
    const root = window.document.documentElement

    root.classList.remove(...appThemes)
    root.classList.add(theme)

    // Матовое стекло: глобальный тумблер + сила
    root.classList.toggle('no-glass', !glassEnabled)
    root.style.setProperty('--glass-blur', `${glassBlur}px`)
    root.style.setProperty('--glass-opacity', `${glassOpacity}`)

    setDesktopTitleBarColors()
  }, [theme, glassEnabled, glassBlur, glassOpacity])

  return null
}

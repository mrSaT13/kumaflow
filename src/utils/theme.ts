import { Theme } from '@/types/themeContext'
import { isDesktop } from './desktop'
import { hslToHex, hslToHsla } from './getAverageColor'

const DEFAULT_TITLE_BAR_COLOR = '#ff000000'
const DEFAULT_TITLE_BAR_SYMBOL = '#ffffff'

export function setDesktopTitleBarColors(transparent = false) {
  if (!isDesktop()) return

  let color = DEFAULT_TITLE_BAR_COLOR
  let symbol = DEFAULT_TITLE_BAR_SYMBOL

  const root = window.document.documentElement
  const styles = getComputedStyle(root)

  if (!transparent) {
    symbol = hslToHsla(styles.getPropertyValue('--foreground').trim())
    color = hslToHsla(styles.getPropertyValue('--background').trim())
  }

  const bgColor = hslToHex(styles.getPropertyValue('--background').trim())

  window.api.setTitleBarOverlayColors({
    color,
    symbol,
    bgColor,
  })
}

export function getValidThemeFromEnv(): Theme | null {
  const { APP_THEME } = window

  if (APP_THEME && Object.values(Theme).includes(APP_THEME as Theme)) {
    return APP_THEME as Theme
  }

  return null
}

/**
 * Светлые темы (фон ~90%+ светлоты). Всё остальное считаем тёмным.
 * Раньше страницы проверяли `theme === Theme.Dark` и на любой другой
 * тёмной теме (nuclear-dark, gruvbox-dark, ...) рисовали белые карточки.
 */
const LIGHT_THEMES: ReadonlySet<Theme> = new Set([
  Theme.Light,
  Theme.NightOwlLight,
  Theme.NoctisLilac,
  Theme.Achiever,
  Theme.TinaciousDesign,
  Theme.DefaultLight,
  Theme.GruvboxLight,
  Theme.SolarizedLight,
  Theme.AyuLight,
  Theme.CatppuccinLatte,
  Theme.RosePineDawn,
  Theme.GithubLight,
  Theme.VSCODELight,
])

export function isDarkTheme(theme: Theme): boolean {
  return !LIGHT_THEMES.has(theme)
}

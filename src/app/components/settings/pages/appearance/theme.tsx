import clsx from 'clsx'
import { Check, Minus, Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ContentItemTitle } from '@/app/components/settings/section'
import { appThemes } from '@/app/observers/theme-observer'
import { useTheme } from '@/store/theme.store'
import { Theme } from '@/types/themeContext'

const { APP_HIDE_THEMES } = window

/** Быстрые пилюли: светлая / тёмная. Список из 44 тем длинный,
 *  самые ходовые темы нельзя терять в его хвосте. */
const QUICK_THEMES: { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: Theme.Light, label: 'Светлая', icon: Sun },
  { theme: Theme.Dark, label: 'Тёмная', icon: Moon },
]

export function ThemeSettingsPicker() {
  const { t } = useTranslation()
  const { theme: currentTheme, setTheme } = useTheme()

  if (APP_HIDE_THEMES) {
    return null
  }

  return (
    <div className="h-full space-y-4">
      <ContentItemTitle>{t('theme.label')}</ContentItemTitle>

      {/* Две пилюли быстрого переключения */}
      <div className="flex gap-2">
        {QUICK_THEMES.map(({ theme, label, icon: Icon }) => {
          const isActive = theme === currentTheme
          return (
            <button
              key={theme}
              type="button"
              onClick={() => setTheme(theme)}
              className={clsx(
                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-secondary text-secondary-foreground hover:border-primary/60',
              )}
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </button>
          )
        })}
      </div>

      {/* Остальные темы — в прокручиваемой сетке, чтобы модалка не разрасталась */}
      <div className="w-full max-h-[420px] overflow-y-auto pr-1 grid grid-cols-4 gap-3">
        {appThemes.map((theme) => {
          const isActive = theme === currentTheme

          return (
            <div key={theme} onClick={() => setTheme(theme)}>
              <ThemePlaceholder theme={theme} />
              <ThemeTitle theme={theme} isActive={isActive} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ThemePlaceholder({ theme }: { theme: Theme }) {
  return (
    <div className={theme}>
      <div className="bg-background aspect-square border border-border rounded overflow-hidden flex cursor-pointer">
        <div className="w-1/3 h-full bg-background border-r border-border flex flex-col p-1 gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-full h-1/5 bg-accent rounded-[2px]" />
          ))}
        </div>
        <div className="w-full h-full bg-background-foreground flex flex-col gap-1 p-1 *:w-full *:h-1/4 *:rounded-[2px]">
          <div className="bg-accent" />
          <div className="bg-primary" />
          <div className="bg-muted" />
          <div className="bg-secondary" />
        </div>
      </div>
    </div>
  )
}

type ThemeTitleProps = {
  isActive: boolean
  theme: Theme
}

export function ThemeTitle({ isActive, theme }: ThemeTitleProps) {
  const { t } = useTranslation()

  return (
    <span
      className={clsx(
        'mt-2 flex items-center gap-1',
        !isActive && 'text-muted-foreground/70',
      )}
    >
      <Check
        size={16}
        strokeWidth={2}
        className={clsx(!isActive && 'hidden')}
        aria-hidden="true"
      />
      <Minus
        size={16}
        strokeWidth={2}
        className={clsx(isActive && 'hidden')}
        aria-hidden="true"
      />
      <span className="text-xs font-medium">{t(`theme.${theme}`)}</span>
    </span>
  )
}

import { ColorSettings } from './colors'
import { FullscreenSettings } from './fullscreen'
import { ThemeSettingsPicker } from './theme'
import { CoverArtPriorityCard } from '@/app/components/settings/pages/content/cover-art-priority'
// import { ThemeSettings } from './theme-settings'
// import { useHomepageSettings, useHomepageActions } from '@/store/homepage.store'
// import { Switch } from '@/app/components/ui/switch'

export function Appearance() {
  // const { newHomepageDesign } = useHomepageSettings()
  // const { toggleNewHomepageDesign } = useHomepageActions()

  return (
    <div className="space-y-4">
      {/* {/* Новый дизайн главной страницы - ЗАКОММЕНТИРОВАНО */}
      {/* <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-lg shadow-sm">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Новый дизайн домашней страницы
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Современный минималистичный интерфейс в стиле Яндекс.Музыки
          </p>
        </div>
        <Switch
          checked={newHomepageDesign}
          onCheckedChange={toggleNewHomepageDesign}
        />
      </div> */}

      {/* Настройки тем - 20+ тем из Feishin */}
      {/* <ThemeSettings /> */}

      <CoverArtPriorityCard />
      <FullscreenSettings />
      <ColorSettings />
      <ThemeSettingsPicker />
    </div>
  )
}

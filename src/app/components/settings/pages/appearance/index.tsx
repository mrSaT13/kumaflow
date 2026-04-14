import { ColorSettings } from './colors'
import { FullscreenSettings } from './fullscreen'
import { ThemeSettingsPicker } from './theme'
import { HomepageSettingsContent } from './homepage'
import { PageDesignSettings } from './page-design'
import { SidebarAppearanceSettings } from './sidebar'
import { CoverArtPriorityCard } from '@/app/components/settings/pages/content/cover-art-priority'
import NewDesignToggle from '@/app/pages/settings/appearance'  // 🆕

export function Appearance() {
  return (
    <div className="space-y-4">
      <NewDesignToggle />  {/* 🆕 Переключатель нового дизайна */}
      <PageDesignSettings />  {/* 🆕 Настройки дизайна страниц */}
      <CoverArtPriorityCard />
      <HomepageSettingsContent />
      <SidebarAppearanceSettings />
      <FullscreenSettings />
      <ColorSettings />
      <ThemeSettingsPicker />
    </div>
  )
}

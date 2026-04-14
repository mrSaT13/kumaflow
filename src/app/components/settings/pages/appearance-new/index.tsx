/**
 * Внешний вид — Цвета, прогресс-бар, сайдбар, главная, дизайн страниц, аватар
 */

import { ColorSettings } from '@/app/components/settings/pages/appearance/colors'
import { ProgressBarSettings } from '@/app/components/settings/pages/audio/progress-bar'
import { FullscreenSettings } from '@/app/components/settings/pages/appearance/fullscreen'
import { SidebarAppearanceSettings } from '@/app/components/settings/pages/appearance/sidebar'
import { HomepageSettingsContent } from '@/app/components/settings/pages/appearance/homepage'
import { PageDesignSettings } from '@/app/components/settings/pages/appearance/page-design'
import { AvatarSettings } from '@/app/components/settings/pages/account/avatar'
import { Separator } from '@/app/components/ui/separator'

export function VisualAppearance() {
  return (
    <div className="space-y-6">
      {/* Аватар */}
      <div>
        <h3 className="text-lg font-semibold mb-3">👤 Аватар</h3>
        <AvatarSettings />
      </div>

      <Separator />

      {/* Дизайн страниц */}
      <div>
        <h3 className="text-lg font-semibold mb-3">📄 Дизайн страниц</h3>
        <PageDesignSettings />
      </div>

      <Separator />

      {/* Главная страница */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🏠 Главная страница</h3>
        <HomepageSettingsContent />
      </div>

      <Separator />

      {/* Боковая панель */}
      <div>
        <h3 className="text-lg font-semibold mb-3">📋 Боковая панель</h3>
        <SidebarAppearanceSettings />
      </div>

      <Separator />

      {/* Полноэкранный плеер */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🖥️ Полноэкранный плеер</h3>
        <FullscreenSettings />
      </div>

      <Separator />

      {/* Цвета треков */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🎨 Цвета треков</h3>
        <ColorSettings />
      </div>

      <Separator />

      {/* Панель прогресса */}
      <div>
        <h3 className="text-lg font-semibold mb-3">📊 Панель прогресса</h3>
        <ProgressBarSettings />
      </div>
    </div>
  )
}

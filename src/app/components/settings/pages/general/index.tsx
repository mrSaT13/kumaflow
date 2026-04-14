/**
 * Общие настройки — Язык, Тема, Рабочий стол
 */

import { LangSelect } from '@/app/components/settings/pages/language/lang-select'
import { ThemeSettings } from '@/app/components/settings/pages/appearance/theme-settings'
import { DesktopSettings } from '@/app/components/settings/pages/desktop/desktop'
import { Separator } from '@/app/components/ui/separator'

export function General() {
  return (
    <div className="space-y-6">
      {/* Язык */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🌐 Язык интерфейса</h3>
        <LangSelect />
      </div>

      <Separator />

      {/* Тема */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🎨 Тема оформления</h3>
        <ThemeSettings />
      </div>

      <Separator />

      {/* Рабочий стол */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🖥️ Рабочий стол</h3>
        <DesktopSettings />
      </div>
    </div>
  )
}

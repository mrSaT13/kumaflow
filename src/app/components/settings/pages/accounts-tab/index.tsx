/**
 * Аккаунты — Dual URL + Shared Listens
 */

import { DualUrlSettings } from '@/app/components/settings/pages/content/dual-url-settings'
import { SharedListensSettings } from '@/app/components/settings/pages/accounts/shared-listens-settings'
import { Separator } from '@/app/components/ui/separator'

export function AccountsTab() {
  return (
    <div className="space-y-6">
      {/* Dual URL */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🔗 Резервный URL (Dual URL)</h3>
        <DualUrlSettings />
      </div>

      <Separator />

      {/* Shared Listens */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🌍 Что слушают другие</h3>
        <SharedListensSettings />
      </div>
    </div>
  )
}

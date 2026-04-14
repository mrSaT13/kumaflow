/**
 * Конфиденциальность — LrcLib
 */

import { LrcLib } from '@/app/components/settings/pages/privacy/services/lrclib'

export function PrivacyTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">🔒 Тексты песен (LrcLib)</h3>
        <LrcLib />
      </div>
    </div>
  )
}

/**
 * Настройки Аккаунты
 * 
 * - Управление аккаунтами Shared Listens (друзья/семья)
 * - Dual URL (резервный сервер)
 */

import { useTranslation } from 'react-i18next'
import { SharedListensSettings } from './accounts/shared-listens-settings'
import { DualUrlSettings } from './content/dual-url-settings'

export function AccountsSettings() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">👥 Аккаунты</h1>
        <p className="text-sm text-muted-foreground">
          Управление аккаунтами Navidrome и резервными серверами
        </p>
      </div>

      {/* Shared Listens */}
      <SharedListensSettings />

      {/* Dual URL */}
      <DualUrlSettings />
    </div>
  )
}

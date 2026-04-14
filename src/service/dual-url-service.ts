/**
 * Dual URL Service - Автоматическое переключение на резервный URL
 *
 * Функционал:
 * - Мониторинг доступности основного и резервного URL
 * - Авто-переключение при недоступности основного
 * - Возврат к основному при восстановлении
 * - Интервал проверки: 30 секунд
 */

import { useAccountsStore } from '@/store/accounts.store'
import { useAppStore } from '@/store/app.store'

export class DualUrlService {
  private monitoringInterval: number | null = null
  private readonly CHECK_INTERVAL = 30000 // 30 секунд
  private readonly TIMEOUT = 5000 // 5 секунд таймаут

  /**
   * Запустить мониторинг
   */
  startMonitoring() {
    if (this.monitoringInterval) {
      console.log('[DualUrl] Monitoring already running')
      return
    }

    const account = useAccountsStore.getState().getCurrentAccount()
    console.log('[DualUrl] Starting monitoring...', {
      account: account?.id,
      primaryUrl: account?.primaryUrl,
      backupUrl: account?.backupUrl,
      isBackupEnabled: account?.isBackupEnabled,
    })

    if (!account || !account.isBackupEnabled || !account.backupUrl) {
      console.warn('[DualUrl] Cannot start monitoring - missing config', {
        hasAccount: !!account,
        isBackupEnabled: account?.isBackupEnabled,
        hasBackupUrl: !!account?.backupUrl,
      })
      return
    }

    this.monitoringInterval = window.setInterval(
      () => this.checkUrls(),
      this.CHECK_INTERVAL
    )

    // Первая проверка сразу
    this.checkUrls()
  }

  /**
   * Остановить мониторинг
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      console.log('[DualUrl] Monitoring stopped')
    }
  }

  /**
   * Проверка URL
   */
  private async checkUrls() {
    const account = useAccountsStore.getState().getCurrentAccount()
    if (!account || !account.isBackupEnabled || !account.backupUrl) return

    const primaryAvailable = await this.testUrl(account.primaryUrl)
    
    // Обновляем статус
    useAccountsStore.getState().updateAccount(account.id, {
      isPrimaryAvailable: primaryAvailable,
      lastHealthCheck: Date.now(),
    })

    console.log('[DualUrl] Health check:', {
      primary: account.primaryUrl,
      primaryAvailable,
      current: account.serverUrl,
    })

    // Логика переключения
    if (!primaryAvailable) {
      // Основной недоступен → переключаемся на резервный
      console.log('[DualUrl] Primary unavailable, switching to backup')
      await this.switchToBackup(account)
    } else if (primaryAvailable && account.serverUrl === account.backupUrl) {
      // Основной восстановлен → возвращаемся
      console.log('[DualUrl] Primary restored, switching back')
      await this.switchToPrimary(account)
    }
  }

  /**
   * Тестирование URL
   */
  private async testUrl(url: string): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT)

      const response = await fetch(`${url}/rest/ping.view`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors',
      })

      clearTimeout(timeoutId)
      
      if (response.ok) {
        console.log('[DualUrl] URL test success:', url)
        return true
      } else {
        console.warn('[DualUrl] URL test failed (non-OK response):', url, response.status)
        return false
      }
    } catch (error) {
      console.warn('[DualUrl] URL test failed (error):', url, error)
      return false
    }
  }

  /**
   * Переключение на резервный URL
   */
  private async switchToBackup(account: Account) {
    if (!account.backupUrl) {
      console.warn('[DualUrl] No backup URL configured')
      return
    }

    // Проверяем резервный URL перед переключением
    const backupAvailable = await this.testUrl(account.backupUrl)
    if (!backupAvailable) {
      console.warn('[DualUrl] Backup also unavailable, not switching')
      this.notify('⚠️ Основной сервер недоступен. Резервный тоже не отвечает.', {
        type: 'error',
        autoClose: 10000,
      })
      return
    }

    // Переключаем
    this.updateServerUrl(account.backupUrl)
    
    // Уведомление
    this.notify('⚠️ Переключено на резервный сервер', {
      type: 'warning',
      autoClose: 5000,
    })
  }

  /**
   * Возврат к основному URL
   */
  private async switchToPrimary(account: Account) {
    // Проверяем основной URL
    const primaryAvailable = await this.testUrl(account.primaryUrl)
    if (!primaryAvailable) {
      console.warn('[DualUrl] Primary still unavailable, staying on backup')
      return
    }

    // Переключаем
    this.updateServerUrl(account.primaryUrl)
    
    // Уведомление
    this.notify('✅ Возврат к основному серверу', {
      type: 'success',
      autoClose: 3000,
    })
  }

  /**
   * Обновление URL в stores
   */
  private updateServerUrl(newUrl: string) {
    const account = useAccountsStore.getState().getCurrentAccount()
    if (!account) {
      console.error('[DualUrl] No account found for URL update')
      return
    }

    console.log('[DualUrl] Updating server URL:', {
      from: account.serverUrl,
      to: newUrl,
    })

    // Обновляем accounts store
    useAccountsStore.getState().updateAccount(account.id, {
      serverUrl: newUrl,
    })

    // Обновляем app store (для httpClient)
    const { actions } = useAppStore.getState()
    actions.setUrl(newUrl)

    // Принудительно обновляем localStorage
    this.saveAppStore(newUrl, account.username)

    console.log('[DualUrl] URL updated successfully:', newUrl)
  }

  /**
   * Сохранение в localStorage
   */
  private saveAppStore(newUrl: string, username: string) {
    try {
      const appStoreState = useAppStore.getState()
      const persistedData = JSON.parse(localStorage.getItem('app_store') || '{}')
      
      const newAppStoreData = {
        state: {
          data: {
            ...persistedData.state?.data,
            url: newUrl,
            isServerConfigured: true,
            username,
          },
          accounts: appStoreState.accounts,
          podcasts: appStoreState.podcasts,
          pages: appStoreState.pages,
        },
      }
      
      localStorage.setItem('app_store', JSON.stringify(newAppStoreData))
      console.log('[DualUrl] localStorage updated')
    } catch (error) {
      console.error('[DualUrl] Failed to save to localStorage:', error)
    }
  }

  /**
   * Уведомление пользователя
   */
  private notify(message: string, options: any) {
    import('react-toastify').then(({ toast }) => {
      toast(message, options)
    })
  }

  /**
   * Тестировать URL вручную (для UI)
   */
  async testUrlManual(url: string): Promise<boolean> {
    return this.testUrl(url)
  }
}

// Синглтон
export const dualUrlService = new DualUrlService()

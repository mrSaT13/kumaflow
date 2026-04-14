/**
 * Dual URL Background Service - Фоновый мониторинг и переключение URL
 * 
 * Работает в фоне независимо от настроек
 * Мониторит основной и резервный URL
 * Автоматически переключает при недоступности основного
 */

import { useAppStore } from '@/store/app.store'

interface DualUrlBackgroundSettings {
  enabled: boolean
  primaryUrl: string  // Приоритетный URL (основной)
  backupUrl: string   // Резервный URL
  checkInterval: number  // в миллисекундах
}

class DualUrlBackgroundService {
  private monitoringInterval: number | null = null
  private readonly DEFAULT_CHECK_INTERVAL = 30000  // 30 секунд
  private readonly TIMEOUT = 10000  // 10 секунд таймаут (увеличено для медленных соединений)
  private lastSwitchTime: number = 0
  private readonly SWITCH_COOLDOWN = 60000  // 1 минута между переключениями

  /**
   * Запустить фоновый мониторинг
   */
  start() {
    // Проверяем настройки
    const settings = this.loadSettings()
    if (!settings.enabled || !settings.backupUrl) {
      console.log('[DualURL Background] Not starting - disabled or no backup URL')
      return
    }

    if (this.monitoringInterval) {
      console.log('[DualURL Background] Monitoring already running')
      return
    }

    console.log('[DualURL Background] Starting monitoring...', {
      backupUrl: settings.backupUrl,
      checkInterval: settings.checkInterval,
    })

    this.monitoringInterval = window.setInterval(
      () => this.checkUrls(),
      settings.checkInterval || this.DEFAULT_CHECK_INTERVAL
    )

    // Первая проверка сразу
    this.checkUrls()
  }

  /**
   * Остановить фоновый мониторинг
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      console.log('[DualURL Background] Monitoring stopped')
    }
  }

  /**
   * Проверка URL
   */
  private async checkUrls() {
    const appStore = useAppStore.getState()
    const currentUrl = appStore.data.url  // Текущий активный URL
    const settings = this.loadSettings()

    if (!settings.enabled || !settings.backupUrl || !settings.primaryUrl) {
      console.log('[DualURL Background] Disabled or no URLs configured')
      return
    }

    const primaryUrl = settings.primaryUrl  // Приоритетный (основной) URL
    const backupUrl = settings.backupUrl    // Резервный URL

    // Проверяем что URL разные
    if (primaryUrl === backupUrl) {
      console.log('[DualURL Background] Primary and backup URLs are the same, skipping')
      return
    }

    try {
      // Проверяем приоритетный URL
      const primaryAvailable = await this.testUrl(primaryUrl)

      console.log('[DualURL Background] Health check:', {
        priority: primaryUrl,
        backup: backupUrl,
        primaryAvailable,
        current: currentUrl,
        isOnPriority: currentUrl === primaryUrl,
        isOnBackup: currentUrl === backupUrl,
      })

      // Если приоритетный недоступен и мы на нём → переключаемся на резервный
      if (!primaryAvailable && currentUrl === primaryUrl) {
        console.log('[DualURL Background] Priority unavailable, switching to backup')
        this.switchUrl(backupUrl, 'Резервный URL')
        return
      }

      // Если приоритетный восстановился и мы на резервном → возвращаемся на приоритетный
      if (primaryAvailable && currentUrl === backupUrl) {
        // Ждём 2 проверки подряд чтобы убедиться что приоритетный стабилен
        const isStable = await this.testUrl(primaryUrl)
        if (isStable) {
          console.log('[DualURL Background] Priority restored, switching back')
          this.switchUrl(primaryUrl, 'Приоритетный URL')
        }
      }
    } catch (error) {
      console.error('[DualURL Background] Check error:', error)
    }
  }

  /**
   * Тестирование URL с повторными попытками
   */
  private async testUrl(url: string): Promise<boolean> {
    const MAX_RETRIES = 3  // 3 попытки
    const RETRY_DELAY = 1000  // 1 секунда между попытками

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[DualURL Background] Testing URL (attempt ${attempt}/${MAX_RETRIES}):`, url)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT)

        const response = await fetch(`${url}/rest/ping.view`, {
          method: 'GET',
          signal: controller.signal,
          mode: 'cors',
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          console.log(`[DualURL Background] URL test success on attempt ${attempt}:`, url)
          return true
        } else {
          console.warn(`[DualURL Background] URL test failed (non-OK response):`, url, response.status)
          // Не повторяем для non-OK ответа
          return false
        }
      } catch (error: any) {
        console.warn(`[DualURL Background] URL test failed (attempt ${attempt}/${MAX_RETRIES}):`, url, error.name, error.message)
        
        // Если последняя попытка - возвращаем false
        if (attempt >= MAX_RETRIES) {
          return false
        }

        // Ждём перед следующей попыткой
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      }
    }

    return false
  }

  /**
   * Переключение URL (с cooldown)
   */
  private switchUrl(newUrl: string, label: string) {
    // Проверяем cooldown чтобы избежать бесконечных переключений
    const now = Date.now()
    if (now - this.lastSwitchTime < this.SWITCH_COOLDOWN) {
      console.log('[DualURL Background] Switch cooldown, skipping')
      return
    }
    this.lastSwitchTime = now

    this.switchUrlImmediate(newUrl, label)
  }

  /**
   * Мгновенное переключение URL (без cooldown) - для ошибок сети
   */
  async forceSwitch(reason: 'error' | 'manual' = 'error'): Promise<boolean> {
    const appStore = useAppStore.getState()
    const currentUrl = appStore.data.url
    const settings = this.loadSettings()

    if (!settings.enabled || !settings.primaryUrl || !settings.backupUrl) {
      console.log('[DualURL Background] Force switch skipped - service disabled')
      return false
    }

    // Определяем новый URL (противоположный текущему)
    const newUrl = currentUrl === settings.primaryUrl
      ? settings.backupUrl
      : settings.primaryUrl

    const label = newUrl === settings.primaryUrl ? 'Приоритетный URL' : 'Резервный URL'

    console.log(`[DualURL Background] Force switch requested: ${reason}`, {
      from: currentUrl,
      to: newUrl,
      label,
    })

    // Переключаем без cooldown
    this.switchUrlImmediate(newUrl, label)

    return true
  }

  /**
   * Немедленное переключение URL (внутренний метод)
   */
  private switchUrlImmediate(newUrl: string, label: string) {
    const appStore = useAppStore.getState()

    // Проверяем что URL действительно изменился
    if (appStore.data.url === newUrl) {
      console.log('[DualURL Background] Already on this URL, skipping')
      return
    }

    appStore.actions.setUrl(newUrl)

    // Сохраняем в localStorage
    this.saveAppStoreToLocalStorage(newUrl)

    console.log(`[DualURL Background] Switched to ${label}:`, newUrl)

    // Уведомление
    this.notify(`Переключено на ${label}`, {
      type: 'warning',
      autoClose: 5000,
    })
  }

  /**
   * Сохранение в localStorage
   */
  private saveAppStoreToLocalStorage(newUrl: string) {
    try {
      const appStoreState = useAppStore.getState()
      const persistedData = JSON.parse(localStorage.getItem('app_store') || '{}')

      const newAppStoreData = {
        state: {
          data: {
            ...persistedData.state?.data,
            url: newUrl,
            isServerConfigured: true,
            username: appStoreState.data.username,
          },
          accounts: appStoreState.accounts,
          podcasts: appStoreState.podcasts,
          pages: appStoreState.pages,
        },
      }

      localStorage.setItem('app_store', JSON.stringify(newAppStoreData))
      console.log('[DualURL Background] localStorage updated:', newUrl)
    } catch (error) {
      console.error('[DualURL Background] Failed to save to localStorage:', error)
    }
  }

  /**
   * Загрузка настроек
   */
  private loadSettings(): DualUrlBackgroundSettings {
    const saved = localStorage.getItem('dual-url-settings')
    if (!saved) {
      return {
        enabled: false,
        primaryUrl: '',
        backupUrl: '',
        checkInterval: this.DEFAULT_CHECK_INTERVAL,
      }
    }

    try {
      const settings = JSON.parse(saved)
      return {
        enabled: settings.enabled || false,
        primaryUrl: settings.primaryUrl || '',  // Приоритетный URL
        backupUrl: settings.backupUrl || '',
        checkInterval: settings.checkInterval || this.DEFAULT_CHECK_INTERVAL,
      }
    } catch (error) {
      console.error('[DualURL Background] Failed to load settings:', error)
      return {
        enabled: false,
        primaryUrl: '',
        backupUrl: '',
        checkInterval: this.DEFAULT_CHECK_INTERVAL,
      }
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
   * Проверка состояния сервиса
   */
  isRunning(): boolean {
    return this.monitoringInterval !== null
  }
}

// Синглтон
export const dualUrlBackgroundService = new DualUrlBackgroundService()

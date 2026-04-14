/**
 * Настройки Dual URL - основной и резервный URL сервера
 *
 * Автоматическое переключение при недоступности основного сервера
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Badge } from '@/app/components/ui/badge'
import { Switch } from '@/app/components/ui/switch'
import { useAppStore } from '@/store/app.store'
import { dualUrlService } from '@/service/dual-url-service'
import { Activity, CheckCircle2, Wifi, WifiOff, XCircle } from 'lucide-react'

export function DualUrlSettings() {
  const { t } = useTranslation()
  const { data, actions } = useAppStore()
  
  // Используем текущий URL из app.store
  const [primaryUrl, setPrimaryUrl] = useState(data.url || '')
  const [backupUrl, setBackupUrl] = useState('')
  const [isBackupEnabled, setIsBackupEnabled] = useState(false)
  const [isPrimaryAvailable, setIsPrimaryAvailable] = useState(true)
  const [isBackupAvailable, setIsBackupAvailable] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  // Загрузка настроек из localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dual-url-settings')
    if (saved) {
      try {
        const settings = JSON.parse(saved)
        // Загружаем ОБА URL из настроек
        setPrimaryUrl(settings.primaryUrl || data.url || '')
        setBackupUrl(settings.backupUrl || '')
        setIsBackupEnabled(settings.enabled || false)
        console.log('[DualURL] Loaded settings:', {
          primaryUrl: settings.primaryUrl,
          backupUrl: settings.backupUrl,
          enabled: settings.enabled,
        })
      } catch (e) {
        console.error('[DualURL] Error loading settings:', e)
      }
    } else {
      // Если настроек нет, используем текущий URL как приоритетный
      setPrimaryUrl(data.url || '')
    }
  }, [])

  // Инициализация с текущим URL
  useEffect(() => {
    if (data.url) {
      setPrimaryUrl(data.url)
      console.log('[DualURL] Initialized with current URL:', data.url)
    }
  }, [data.url])

  // Запуск мониторинга при включении
  useEffect(() => {
    if (isBackupEnabled) {
      dualUrlService.startMonitoring()
    } else {
      dualUrlService.stopMonitoring()
    }

    return () => dualUrlService.stopMonitoring()
  }, [isBackupEnabled])

  // Автоматический тест при открытии компонента
  useEffect(() => {
    if (primaryUrl || backupUrl) {
      console.log('[DualURL] Auto-testing on component mount...')
      checkServers()
    }
  }, [])

  // Проверка серверов
  const checkServers = async () => {
    setIsChecking(true)

    try {
      // Проверяем основной
      const primaryOk = await dualUrlService.testUrlManual(primaryUrl)
      setIsPrimaryAvailable(primaryOk)

      // Проверяем резервный
      const backupOk = backupUrl ? await dualUrlService.testUrlManual(backupUrl) : false
      setIsBackupAvailable(backupOk)

      // Статус
      if (!primaryOk && !backupOk) {
        toast.error('❌ Оба сервера недоступны!')
      } else if (!primaryOk && backupOk) {
        toast.warning('⚠️ Основной недоступен, резервный работает')
      } else {
        toast.success('✅ Основной сервер доступен')
      }
    } catch (error) {
      console.error('[DualURL] Check error:', error)
      toast.error('Ошибка проверки серверов')
    } finally {
      setIsChecking(false)
    }
  }

  // Сохранение настроек
  const handleSave = () => {
    if (!primaryUrl) {
      toast.error('Основной URL не указан')
      return
    }

    if (!backupUrl) {
      toast.error('Резервный URL не указан')
      return
    }

    console.log('[DualURL] Saving settings:', {
      primaryUrl,
      backupUrl,
      isBackupEnabled,
    })

    // Сохраняем в localStorage ОБА URL
    const settings = {
      primaryUrl,  // Приоритетный (основной) URL
      backupUrl,   // Резервный URL
      enabled: isBackupEnabled,
    }
    localStorage.setItem('dual-url-settings', JSON.stringify(settings))

    toast.success('Настройки Dual URL сохранены')

    // Если включено, запускаем мониторинг
    if (isBackupEnabled && backupUrl) {
      dualUrlService.startMonitoring()
      checkServers()
    }
  }

  // Ручное переключение
  const handleSwitchToBackup = () => {
    if (!backupUrl) {
      toast.error('Резервный URL не указан')
      return
    }

    // Обновляем app store (для httpClient)
    actions.setUrl(backupUrl)

    // Сохраняем в localStorage
    saveAppStoreToLocalStorage(backupUrl)

    toast.success('Переключено на резервный сервер')
    console.log('[DualURL] Manual switch to backup:', backupUrl)
  }

  const handleSwitchToPrimary = () => {
    // Обновляем app store (для httpClient)
    actions.setUrl(primaryUrl)

    // Сохраняем в localStorage
    saveAppStoreToLocalStorage(primaryUrl)

    toast.success('Возврат к основному серверу')
    console.log('[DualURL] Manual switch to primary:', primaryUrl)
  }

  // Сохранение в localStorage
  const saveAppStoreToLocalStorage = (newUrl: string) => {
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
      console.log('[DualURL] localStorage updated:', newUrl)
    } catch (error) {
      console.error('[DualURL] Failed to save to localStorage:', error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <CardTitle>Dual URL (Резервный URL сервера)</CardTitle>
        </div>
        <CardDescription>
          Автоматическое переключение на резервный сервер при недоступности основного
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Статус мониторинга */}
        {isBackupEnabled && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-md border border-muted">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Мониторинг активен</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Основной:</Label>
                <Badge variant={isPrimaryAvailable ? 'success' : 'destructive'} className="text-xs">
                  {isPrimaryAvailable ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Доступен
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      Недоступен
                    </>
                  )}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <Label className="text-xs">Резервный:</Label>
                <Badge variant={isBackupAvailable ? 'success' : 'destructive'} className="text-xs">
                  {isBackupAvailable ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Доступен
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      Недоступен
                    </>
                  )}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Основной URL */}
        <div className="space-y-2">
          <Label htmlFor="primary-url">Основной URL (приоритетный)</Label>
          <Input
            id="primary-url"
            type="url"
            placeholder="https://navidrome.example.com"
            value={primaryUrl}
            onChange={(e) => setPrimaryUrl(e.target.value)}
            className="font-mono"
          />
          <p className="text-sm text-muted-foreground">
            Сервер который используется по умолчанию
          </p>
        </div>

        {/* Резервный URL */}
        <div className="space-y-2">
          <Label htmlFor="backup-url">Резервный URL (дополнительный)</Label>
          <Input
            id="backup-url"
            type="url"
            placeholder="http://192.168.1.100:4533"
            value={backupUrl}
            onChange={(e) => setBackupUrl(e.target.value)}
            className="font-mono"
          />
          <p className="text-sm text-muted-foreground">
            Например: http://192.168.1.100:4533 (локальный) или https://backup.example.com
          </p>
        </div>

        {/* Переключатель */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-muted">
          <div className="space-y-0.5">
            <Label>Авто-переключение</Label>
            <p className="text-xs text-muted-foreground">
              Мониторинг каждые 30 секунд
            </p>
          </div>
          <Switch
            checked={isBackupEnabled}
            onCheckedChange={setIsBackupEnabled}
          />
        </div>

        {/* Кнопки управления */}
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            variant="default"
            className="flex-1"
          >
            Сохранить настройки
          </Button>

          <Button
            onClick={checkServers}
            variant="outline"
            disabled={isChecking || !primaryUrl}
            className={isChecking ? 'animate-pulse' : ''}
          >
            {isChecking ? (
              <Activity className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4 mr-2" />
            )}
            {isChecking ? 'Проверка...' : 'Проверить'}
          </Button>
        </div>

        {/* Кнопки переключения */}
        {isBackupEnabled && backupUrl && (
          <div className="flex gap-2">
            <Button
              onClick={handleSwitchToPrimary}
              variant={data.url === primaryUrl ? 'default' : 'outline'}
              className="flex-1"
              disabled={!isPrimaryAvailable}
            >
              {data.url === primaryUrl ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Используется основной
                </>
              ) : (
                'На основной'
              )}
            </Button>

            <Button
              onClick={handleSwitchToBackup}
              variant={data.url === backupUrl ? 'default' : 'outline'}
              className="flex-1"
              disabled={!isBackupAvailable}
            >
              {data.url === backupUrl ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Используется резервный
                </>
              ) : (
                'На резервный'
              )}
            </Button>
          </div>
        )}

        {/* Информация */}
        <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <p className="text-xs text-blue-500">
            Совет: Используйте основной сервер для работы из интернета 
            и резервный локальный для быстрого доступа дома.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

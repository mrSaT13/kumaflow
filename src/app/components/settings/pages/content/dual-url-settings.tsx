/**
 * Настройки Dual URL - основной и резервный сервер
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
import { useCurrentAccount, useAccountsActions } from '@/store/accounts.store'
import { useAppStore } from '@/store/app.store'
import { dualUrlService } from '@/service/dual-url-service'
import { Activity, CheckCircle2, Wifi, WifiOff, XCircle } from 'lucide-react'

export function DualUrlSettings() {
  const { t } = useTranslation()
  const account = useCurrentAccount()
  const { updateAccount } = useAccountsActions()

  const [primaryUrl, setPrimaryUrl] = useState(account?.primaryUrl || '')
  const [backupUrl, setBackupUrl] = useState(account?.backupUrl || '')
  const [isBackupEnabled, setIsBackupEnabled] = useState(account?.isBackupEnabled || false)
  const [isPrimaryAvailable, setIsPrimaryAvailable] = useState(account?.isPrimaryAvailable || true)
  const [isBackupAvailable, setIsBackupAvailable] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  // Инициализация при загрузке
  useEffect(() => {
    if (account) {
      setPrimaryUrl(account.primaryUrl || '')
      setBackupUrl(account.backupUrl || '')
      setIsBackupEnabled(account.isBackupEnabled || false)
      setIsPrimaryAvailable(account.isPrimaryAvailable || true)
    }
  }, [account])

  // Запуск мониторинга при включении
  useEffect(() => {
    if (isBackupEnabled) {
      dualUrlService.startMonitoring()
    } else {
      dualUrlService.stopMonitoring()
    }
    
    return () => dualUrlService.stopMonitoring()
  }, [isBackupEnabled])

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

      // Обновляем аккаунт
      if (account) {
        updateAccount(account.id, {
          isPrimaryAvailable: primaryOk,
          isBackupAvailable: backupOk,
          lastHealthCheck: Date.now(),
        })
      }

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
    if (!account) {
      toast.error('Аккаунт не найден')
      return
    }

    updateAccount(account.id, {
      primaryUrl,
      backupUrl: backupUrl || undefined,
      isBackupEnabled,
    })

    toast.success('✅ Настройки Dual URL сохранены')
    
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

    if (account) {
      // Обновляем accounts store
      updateAccount(account.id, {
        serverUrl: backupUrl,
      })

      // Обновляем app store (для httpClient)
      const { actions } = useAppStore.getState()
      actions.setUrl(backupUrl)

      // Сохраняем в localStorage
      saveAppStoreToLocalStorage(backupUrl, account.username)

      toast.success('🔄 Переключено на резервный сервер')
      console.log('[DualURL] Manual switch to backup:', backupUrl)
    }
  }

  const handleSwitchToPrimary = () => {
    if (account) {
      // Обновляем accounts store
      updateAccount(account.id, {
        serverUrl: primaryUrl,
      })

      // Обновляем app store (для httpClient)
      const { actions } = useAppStore.getState()
      actions.setUrl(primaryUrl)

      // Сохраняем в localStorage
      saveAppStoreToLocalStorage(primaryUrl, account.username)

      toast.success('✅ Возврат к основному серверу')
      console.log('[DualURL] Manual switch to primary:', primaryUrl)
    }
  }

  // Сохранение в localStorage
  const saveAppStoreToLocalStorage = (newUrl: string, username: string) => {
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
          <CardTitle>🔄 Dual URL (Резервный сервер)</CardTitle>
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
            {account?.lastHealthCheck && (
              <p className="text-xs text-muted-foreground">
                Последняя проверка: {new Date(account.lastHealthCheck).toLocaleTimeString()}
              </p>
            )}
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
            💾 Сохранить настройки
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
              variant={account?.serverUrl === primaryUrl ? 'default' : 'outline'}
              className="flex-1"
              disabled={!isPrimaryAvailable}
            >
              {account?.serverUrl === primaryUrl ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Используется основной
                </>
              ) : (
                '✅ На основной'
              )}
            </Button>

            <Button
              onClick={handleSwitchToBackup}
              variant={account?.serverUrl === backupUrl ? 'default' : 'outline'}
              className="flex-1"
              disabled={!isBackupAvailable}
            >
              {account?.serverUrl === backupUrl ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Используется резервный
                </>
              ) : (
                '🔄 На резервный'
              )}
            </Button>
          </div>
        )}

        {/* Информация */}
        <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <p className="text-xs text-blue-500">
            💡 <strong>Совет:</strong> Используйте основной сервер для работы из интернета 
            и резервный локальный для быстрого доступа дома.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

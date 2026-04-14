/**
 * Dual URL - Резервный сервер
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
import { useAppData, useAppActions } from '@/store/app.store'
import { fetchWithCorsProxy } from '@/utils/cors-proxy'

export function DualUrlSettings() {
  const { t } = useTranslation()
  const { url: currentUrl, username, password } = useAppData()
  const { setUrl } = useAppActions()

  const [enabled, setEnabled] = useState(false)
  const [backupUrl, setBackupUrl] = useState('')
  const [checkInterval, setCheckInterval] = useState(60)
  const [currentServer, setCurrentServer] = useState<'primary' | 'backup'>('primary')
  const [primaryAvailable, setPrimaryAvailable] = useState(true)
  const [backupAvailable, setBackupAvailable] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  // Загрузка
  useEffect(() => {
    const saved = localStorage.getItem('dual-url-settings')
    if (saved) {
      try {
        const settings = JSON.parse(saved)
        setBackupUrl(settings.backupUrl || '')
        setEnabled(settings.enabled || false)
        setCheckInterval(settings.checkInterval || 60)
      } catch (e) {
        console.error('[DualURL] Error loading:', e)
      }
    }
  }, [])

  // Сохранение
  const saveSettings = (newSettings: any) => {
    const settings = {
      backupUrl: newSettings.backupUrl ?? backupUrl,
      enabled: newSettings.enabled ?? enabled,
      checkInterval: newSettings.checkInterval ?? checkInterval,
    }
    localStorage.setItem('dual-url-settings', JSON.stringify(settings))
  }

  // Проверка
  const checkServers = async () => {
    setIsChecking(true)
    try {
      // Основной
      try {
        const url = `${currentUrl}/rest/ping.view?v=1.16.1&c=KumaFlow&f=json`
        const r = await fetchWithCorsProxy(url)
        const data = await r.json()
        const ok = data['subsonic-response']?.status === 'ok'
        setPrimaryAvailable(ok)
        console.log('[DualURL] Primary:', ok ? '✅' : '❌')
      } catch (e) {
        setPrimaryAvailable(false)
        console.log('[DualURL] Primary: ❌', (e as Error).message)
      }

      // Резервный
      if (backupUrl) {
        try {
          const url = `${backupUrl}/rest/ping.view?v=1.16.1&c=KumaFlow&f=json`
          const r = await fetchWithCorsProxy(url)
          const data = await r.json()
          const ok = data['subsonic-response']?.status === 'ok'
          setBackupAvailable(ok)
        } catch (e) {
          setBackupAvailable(false)
        }
      }

      // Авто переключение
      if (enabled && backupUrl) {
        if (!primaryAvailable && backupAvailable && currentServer === 'primary') {
          switchToBackup()
        } else if (primaryAvailable && currentServer === 'backup') {
          switchToPrimary()
        }
      }
    } finally {
      setIsChecking(false)
    }
  }

  const switchToBackup = async () => {
    if (!backupUrl) return
    setUrl(backupUrl)
    setCurrentServer('backup')
    toast.success('🔄 Переключено на резервный сервер')
  }

  const switchToPrimary = async () => {
    setUrl(currentUrl)
    setCurrentServer('primary')
    toast.success('✅ Возврат на основной сервер')
  }

  const handleToggle = (v: boolean) => {
    setEnabled(v)
    saveSettings({ enabled: v })
    if (v) {
      toast.info('Dual URL включён')
      checkServers()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔄 Dual URL (Резервный сервер)</CardTitle>
        <CardDescription>Автоматическое переключение при недоступности</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Статус */}
        {enabled && (
          <div className="space-y-2 p-3 bg-muted rounded-md">
            <div className="flex justify-between">
              <Label>Текущий:</Label>
              <Badge variant={currentServer === 'backup' ? 'warning' : 'success'}>
                {currentServer === 'backup' ? '🔄 Резервный' : '✅ Основной'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <Label>Основной:</Label>
              <Badge variant={primaryAvailable ? 'success' : 'destructive'}>
                {primaryAvailable ? '✅' : '❌'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <Label>Резервный:</Label>
              <Badge variant={backupAvailable ? 'success' : 'destructive'}>
                {backupAvailable ? '✅' : '❌'}
              </Badge>
            </div>
          </div>
        )}

        {/* URL */}
        <div className="space-y-2">
          <Label>URL резервного сервера</Label>
          <Input
            placeholder="http://192.168.1.100:4533"
            value={backupUrl}
            onChange={(e) => setBackupUrl(e.target.value)}
          />
        </div>

        {/* Интервал */}
        <div className="space-y-2">
          <Label>Интервал проверки (сек)</Label>
          <Input
            type="number"
            min="10"
            max="300"
            value={checkInterval}
            onChange={(e) => setCheckInterval(parseInt(e.target.value) || 60)}
          />
        </div>

        {/* Переключатель */}
        <div className="flex justify-between items-center">
          <div>
            <Label>Включить Dual URL</Label>
            <p className="text-xs text-muted-foreground">Авто переключение</p>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>

        {/* Кнопки */}
        <div className="flex gap-2">
          <Button onClick={() => { saveSettings({}); checkServers(); }} variant="outline">
            💾 Сохранить
          </Button>
          <Button onClick={checkServers} variant="outline" disabled={!enabled}>
            {isChecking ? '⏳' : '🔍'} Проверить
          </Button>
          {enabled && backupAvailable && (
            <Button
              onClick={currentServer === 'primary' ? switchToBackup : switchToPrimary}
              variant="secondary"
            >
              {currentServer === 'primary' ? '🔄 На резервный' : '✅ На основной'}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          ⚙️ Проверка каждые {checkInterval} сек • Переключение при 2 неудачах
        </p>
      </CardContent>
    </Card>
  )
}

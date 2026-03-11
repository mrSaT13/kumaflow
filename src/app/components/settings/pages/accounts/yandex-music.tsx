import { useState } from 'react'
import { useYandexMusic } from '@/store/yandex-music.store'
import { yandexMusicService } from '@/service/yandex-music-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Switch } from '@/app/components/ui/switch'
import { toast } from 'react-toastify'

export function YandexMusicSettings() {
  const { 
    settings, 
    setYandexMusicEnabled, 
    setYandexMusicToken, 
    setYandexMusicLogin,
    clearCredentials 
  } = useYandexMusic()

  const [loginInput, setLoginInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [tokenInput, setTokenInput] = useState(settings.yandexMusicToken)
  const [storedLoginInput, setStoredLoginInput] = useState(settings.yandexMusicLogin)
  const [isLoading, setIsLoading] = useState(false)
  const [authMode, setAuthMode] = useState<'auto' | 'manual'>('auto')

  const handleAutoAuth = async () => {
    if (!loginInput || !passwordInput) {
      toast('❌ Введите логин и пароль', { type: 'error' })
      return
    }

    setIsLoading(true)
    
    try {
      // Вызываем Python скрипт через Electron IPC
      const result = await (window as any).api?.yandexMusicAuth?.(loginInput, passwordInput)
      
      if (result?.success && result.x_token) {
        setYandexMusicToken(result.x_token)
        setYandexMusicLogin(result.login || loginInput)
        yandexMusicService.initialize(result.x_token)
        
        toast(`✅ Яндекс.Музыка подключена! (${result.name || result.login})`, { type: 'success' })
        setYandexMusicEnabled(true)
      } else {
        toast('❌ Ошибка авторизации: ' + (result?.error || 'Неизвестная ошибка'), { type: 'error' })
      }
    } catch (error) {
      console.error('Yandex Music auth error:', error)
      toast('❌ Ошибка: ' + (error as Error).message, { type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleManualSave = () => {
    setYandexMusicToken(tokenInput)
    setYandexMusicLogin(storedLoginInput)
    
    // Инициализируем сервис
    yandexMusicService.initialize(tokenInput)
    
    toast('✅ Яндекс.Музыка настройки сохранены', {
      type: 'success',
    })
  }

  const handleTestConnection = async () => {
    if (!tokenInput) {
      toast('❌ Введите токен', { type: 'error' })
      return
    }

    setIsLoading(true)
    
    try {
      // Инициализируем сервис
      yandexMusicService.initialize(tokenInput)
      
      // Пробуем сделать простой запрос
      const artists = await yandexMusicService.searchArtists('test', 1)
      
      if (artists && artists.length > 0) {
        toast('✅ Яндекс.Музыка подключена успешно!', { type: 'success' })
        setYandexMusicEnabled(true)
      } else {
        toast('⚠️ Ошибка подключения к Яндекс.Музыке', { type: 'warning' })
      }
    } catch (error) {
      console.error('Yandex Music connection error:', error)
      toast('❌ Ошибка подключения: ' + (error as Error).message, { type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    clearCredentials()
    setTokenInput('')
    setStoredLoginInput('')
    setLoginInput('')
    setPasswordInput('')
    yandexMusicService.initialize('')
    toast('🗑️ Настройки Яндекс.Музыки очищены', { type: 'info' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Яндекс.Музыка</CardTitle>
        <CardDescription>
          Интеграция с Яндекс.Музыкой для поиска и рекомендаций
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Яндекс.Музыка API</Label>
            <p className="text-sm text-muted-foreground">
              Поиск треков, обложки, жанры и рекомендации
            </p>
          </div>
          <Switch
            checked={settings.yandexMusicEnabled}
            onCheckedChange={setYandexMusicEnabled}
            disabled={!tokenInput}
          />
        </div>

        {/* Auth Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={authMode === 'auto' ? 'default' : 'outline'}
            onClick={() => setAuthMode('auto')}
            className="flex-1"
          >
            🔐 Быстрая авторизация
          </Button>
          <Button
            variant={authMode === 'manual' ? 'default' : 'outline'}
            onClick={() => setAuthMode('manual')}
            className="flex-1"
          >
            🔑 Ввести токен
          </Button>
        </div>

        {/* Auto Auth */}
        {authMode === 'auto' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="yandex-login-input">Логин Яндекс</Label>
              <Input
                id="yandex-login-input"
                type="text"
                placeholder="your_login@yandex.ru"
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                className="flex-1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="yandex-password-input">Пароль</Label>
              <Input
                id="yandex-password-input"
                type="password"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="flex-1"
              />
            </div>

            <Button onClick={handleAutoAuth} disabled={isLoading} className="w-full">
              {isLoading ? 'Авторизация...' : 'Войти и получить токен'}
            </Button>

            <p className="text-xs text-muted-foreground">
              Токен будет получен автоматически и сохранён локально
            </p>
          </div>
        )}

        {/* Manual Token */}
        {authMode === 'manual' && (
          <div className="space-y-3">
            {/* Token Input */}
            <div className="space-y-2">
              <Label htmlFor="yandex-token">X-Token *</Label>
              <Input
                id="yandex-token"
                type="password"
                placeholder="Введите x_token от Яндекс.Музыки"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="flex-1"
              />
              <p className="text-xs text-muted-foreground">
                Токен авторизации (x_token) для доступа к API
              </p>
            </div>

            {/* Login Input */}
            <div className="space-y-2">
              <Label htmlFor="yandex-login">Логин (для отображения)</Label>
              <Input
                id="yandex-login"
                type="text"
                placeholder="Ваш логин Яндекс"
                value={storedLoginInput}
                onChange={(e) => setStoredLoginInput(e.target.value)}
                className="flex-1"
              />
              <p className="text-xs text-muted-foreground">
                Отображается в настройках для идентификации
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button onClick={handleManualSave} variant="default">
                Сохранить
              </Button>
              <Button onClick={handleTestConnection} variant="secondary" disabled={isLoading}>
                {isLoading ? 'Проверка...' : 'Проверить подключение'}
              </Button>
            </div>
          </div>
        )}

        {/* Clear Button */}
        <Button onClick={handleClear} variant="outline" className="w-full">
          🗑️ Очистить настройки
        </Button>

        {/* Help */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Как получить токен вручную:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Используйте "Быстрая авторизация" (рекомендуется)</li>
            <li>Или следуйте инструкции в YANDEX_MUSIC_TOKEN.md</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            <strong>Важно:</strong> Токен хранится только локально в вашем браузере
          </p>
        </div>

        {/* Status */}
        {settings.yandexMusicEnabled && settings.yandexMusicToken && (
          <div className="text-xs text-green-600">
            ✅ Яндекс.Музыка подключена ({settings.yandexMusicLogin || 'без имени'})
          </div>
        )}
      </CardContent>
    </Card>
  )
}

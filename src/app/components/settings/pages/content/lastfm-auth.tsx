import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui/button'
import { lastFmService } from '@/service/lastfm-api'
import { useExternalApi } from '@/store/external-api.store'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { toast } from 'react-toastify'

/**
 * Компонент авторизации Last.fm
 */
export function LastFmAuth() {
  const { settings, setLastFmApiKey, setLastFmApiSecret } = useExternalApi()
  const [isAuthorizing, setIsAuthorizing] = useState(false)  // Получение токена
  const [isAuthorized, setIsAuthorized] = useState(false)   // Session key получен
  const [tokenReceived, setTokenReceived] = useState(false) // Токен получен, ждём авторизации
  const [secretInput, setSecretInput] = useState(settings.lastFmApiSecret)
  const [authToken, setAuthToken] = useState<string>('')    // Сохраняем токен!

  /**
   * Проверить авторизацию при загрузке
   */
  useEffect(() => {
    const checkAuth = () => {
      const sessionKey = localStorage.getItem('lastfm_session_key')
      if (sessionKey) {
        lastFmService.setSessionKey(sessionKey)
        setIsAuthorized(true)
        setIsAuthorizing(false)
        setTokenReceived(false)
        console.log('[Last.fm Auth] ✅ Session key loaded from localStorage:', sessionKey.substring(0, 8) + '...')
      } else {
        console.log('[Last.fm Auth] ⚠️ No session key in localStorage')
      }
    }

    // Проверяем сразу
    checkAuth()

    // Проверяем каждые 2 секунды (на случай если пользователь только что авторизовался)
    const interval = setInterval(checkAuth, 2000)
    return () => clearInterval(interval)
  }, [])

  /**
   * Начать процесс авторизации
   */
  async function handleAuthorize() {
    if (!settings.lastFmApiKey) {
      toast.error('Введите API ключ Last.fm')
      return
    }

    if (!settings.lastFmApiSecret) {
      toast.error('Введите API Secret Last.fm')
      return
    }

    setIsAuthorizing(true)
    setTokenReceived(false)  // Сбрасываем

    try {
      // Инициализируем сервис с секретом
      lastFmService.initialize(settings.lastFmApiKey, settings.lastFmApiSecret)

      // Шаг 1: Получить токен
      const token = await lastFmService.getToken()

      if (!token) {
        toast.error('Не удалось получить токен авторизации')
        setIsAuthorizing(false)
        return
      }

      console.log('[Last.fm] Got token:', token)
      
      // СОХРАНЯЕМ ТОКЕН!
      setAuthToken(token)

      // Шаг 2: Открыть браузер для авторизации
      const authUrl = lastFmService.getAuthorizationUrl(token)
      window.open(authUrl, '_blank')

      toast.info('Авторизуйтесь в открывшемся окне Last.fm, затем нажмите "Готово"')
      
      // Шаг 3: Токен получен, показываем кнопку "Готово"
      setIsAuthorizing(false)
      setTokenReceived(true)  // ← Токен получен!
    } catch (error) {
      console.error('[Last.fm Auth] Error:', error)
      toast.error('Ошибка авторизации Last.fm')
      setIsAuthorizing(false)
      setTokenReceived(false)
    }
  }

  /**
   * Завершить авторизацию (получить session key)
   */
  async function handleFinishAuth() {
    if (!settings.lastFmApiKey || !settings.lastFmApiSecret) {
      console.error('[Last.fm Auth] Missing API key or secret')
      toast.error('Введите API ключ и Secret')
      return
    }
    
    if (!authToken) {
      console.error('[Last.fm Auth] No token stored')
      toast.error('Токен не получен. Нажмите "Авторизовать" сначала.')
      return
    }

    try {
      console.log('[Last.fm Auth] Getting session with stored token...')
      console.log('[Last.fm Auth] Token:', authToken.substring(0, 10) + '...')
      
      // Используем СОХРАНЁННЫЙ токен, не получаем новый!
      const sessionKey = await lastFmService.getSession(authToken)
      console.log('[Last.fm Auth] Got session key:', sessionKey ? 'yes (' + sessionKey.substring(0, 10) + '...)' : 'no')

      if (sessionKey) {
        localStorage.setItem('lastfm_session_key', sessionKey)
        lastFmService.setSessionKey(sessionKey)
        setIsAuthorized(true)
        setIsAuthorizing(false)
        setTokenReceived(false)
        toast.success('Last.fm авторизован! Scrobbling включен.')
        
        console.log('[Last.fm Auth] Success! Reloading...')
        // Перезагружаем страницу для применения настроек
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        toast.error('Не удалось получить session key. Попробуйте снова.')
      }
    } catch (error) {
      console.error('[Last.fm Auth] Error:', error)
      toast.error('Ошибка: ' + (error as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="lastfm-secret">API Secret</Label>
        <div className="flex gap-2">
          <Input
            id="lastfm-secret"
            type="password"
            placeholder="Введите Last.fm API Secret"
            value={secretInput}
            onChange={(e) => {
              setSecretInput(e.target.value)
              setLastFmApiSecret(e.target.value)
            }}
            className="flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          API Secret отображается один раз при создании ключа на last.fm/api/account/create
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Last.fm Авторизация</h3>
          <p className="text-sm text-muted-foreground">
            {isAuthorized
              ? '✅ Авторизован (scrobbling работает)'
              : tokenReceived
                ? '🔑 Токен получен. Авторизуйтесь в браузере и нажмите "Готово"'
                : isAuthorizing
                  ? '⏳ Получение токена...'
                  : 'Требуется для scrobbling и Now Playing'}
          </p>
        </div>
        {isAuthorized ? (
          <Button
            onClick={handleAuthorize}
            variant="outline"
          >
            Повторить авторизацию
          </Button>
        ) : tokenReceived ? (
          <Button
            onClick={handleFinishAuth}
            disabled={!settings.lastFmApiKey || !settings.lastFmApiSecret}
            variant="default"
            className="bg-green-600 hover:bg-green-700"
          >
            ✅ Я авторизовался (Готово)
          </Button>
        ) : (
          <Button
            onClick={handleAuthorize}
            disabled={isAuthorizing || !settings.lastFmApiKey || !settings.lastFmApiSecret}
            variant="default"
          >
            {isAuthorizing ? '⏳ Получение токена...' : 'Авторизовать'}
          </Button>
        )}
      </div>

      {isAuthorized && (
        <Button
          onClick={() => {
            localStorage.removeItem('lastfm_session_key')
            setIsAuthorized(false)
            toast.info('Last.fm отключен')
          }}
          variant="outline"
          size="sm"
        >
          Отозвать авторизацию
        </Button>
      )}
    </div>
  )
}

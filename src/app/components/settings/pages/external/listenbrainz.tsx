import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useListenBrainz } from '@/store/listenbrainz.store'
import { listenBrainzApi } from '@/service/listenbrainz-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Switch } from '@/app/components/ui/switch'
import { Badge } from '@/app/components/ui/badge'
import { ExternalLink, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'react-toastify'

export function ListenBrainzSettings() {
  const { t } = useTranslation()
  const { enabled, token, userName, isAuthenticated, setEnabled, setToken, clearToken, validateToken } = useListenBrainz()
  
  const [inputToken, setInputToken] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  const handleOpenListenBrainz = () => {
    window.open('https://listenbrainz.org/profile/login/', '_blank')
  }

  const handleSaveToken = async () => {
    if (!inputToken.trim()) {
      toast.error('Введите токен')
      return
    }

    setIsVerifying(true)
    
    // Сохраняем токен
    listenBrainzApi.setToken(inputToken.trim())
    
    // Проверяем токен
    const isValid = await listenBrainzApi.validateToken()
    
    setIsVerifying(false)
    
    if (isValid) {
      setToken(inputToken.trim())
      toast.success('✅ Токен ListenBrainz успешно сохранён!')
      setInputToken('')
    } else {
      toast.error('❌ Неверный токен ListenBrainz')
      clearToken()
    }
  }

  const handleVerify = async () => {
    if (!token) return
    
    setIsVerifying(true)
    const isValid = await validateToken()
    setIsVerifying(false)
    
    if (isValid) {
      toast.success('✅ Токен действителен!')
    } else {
      toast.error('❌ Токен недействителен')
    }
  }

  const handleToggle = (newEnabled: boolean) => {
    if (newEnabled && !token) {
      toast.error('Сначала добавьте токен ListenBrainz')
      return
    }
    setEnabled(newEnabled)
    toast.success(newEnabled ? '✅ ListenBrainz включён' : '❌ ListenBrainz выключен')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🎵 ListenBrainz
          {isAuthenticated && (
            <Badge variant="success" className="ml-2">
              <Check className="w-3 h-3 mr-1" />
              Подключено
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Альтернатива Last.fm для скробблинга и музыкальных рекомендаций
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Переключатель */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Включить ListenBrainz</Label>
            <p className="text-sm text-muted-foreground">
              Отправлять прослушивания в ListenBrainz
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={!token}
          />
        </div>

        {/* Токен */}
        {!token ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Токен ListenBrainz</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Введите ваш токен"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={handleOpenListenBrainz}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Получить токен
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Токен можно получить в настройках профиля ListenBrainz
              </p>
            </div>
            <Button
              onClick={handleSaveToken}
              disabled={isVerifying || !inputToken.trim()}
              className="w-full"
            >
              {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Сохранить токен
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Статус токена</Label>
                {isAuthenticated ? (
                  <Badge variant="success">
                    <Check className="w-3 h-3 mr-1" />
                    Действителен
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <X className="w-3 h-3 mr-1" />
                    Не проверен
                  </Badge>
                )}
              </div>
              {userName && (
                <p className="text-sm">
                  👤 Пользователь: <span className="font-medium">{userName}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Токен: {token.slice(0, 8)}...{token.slice(-8)}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleVerify}
                disabled={isVerifying}
                className="flex-1"
              >
                {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Проверить
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenListenBrainz}
                className="flex-1"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Профиль
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  clearToken()
                  toast.success('Токен удалён')
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        )}

        {/* Информация */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
          <p className="text-sm text-blue-400">
            💡 <strong>Совет:</strong> ListenBrainz — это свободная альтернатива Last.fm 
            от проекта MusicBrainz. Отправляйте данные о прослушиваниях и получайте 
            персональные рекомендации.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

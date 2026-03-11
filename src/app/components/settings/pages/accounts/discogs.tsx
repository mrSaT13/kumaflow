import { useState } from 'react'
import { useExternalApi } from '@/store/external-api.store'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { toast } from 'react-toastify'
import { discogsService } from '@/service/discogs-api'

export function DiscogsSettings() {
  const {
    settings,
    setDiscogsConsumerKey,
    setDiscogsConsumerSecret,
    setDiscogsToken,
    setDiscogsTokenSecret,
    setDiscogsEnabled,
  } = useExternalApi()

  const [consumerKeyInput, setConsumerKeyInput] = useState(settings.discogsConsumerKey)
  const [consumerSecretInput, setConsumerSecretInput] = useState(settings.discogsConsumerSecret)
  const [tokenInput, setTokenInput] = useState(settings.discogsToken)
  const [tokenSecretInput, setTokenSecretInput] = useState(settings.discogsTokenSecret)

  const handleSave = () => {
    setDiscogsConsumerKey(consumerKeyInput)
    setDiscogsConsumerSecret(consumerSecretInput)
    setDiscogsToken(tokenInput)
    setDiscogsTokenSecret(tokenSecretInput)
    
    // Инициализируем сервис
    if (consumerKeyInput && consumerSecretInput) {
      discogsService.initialize(consumerKeyInput, consumerSecretInput, tokenInput, tokenSecretInput)
    }
    
    toast('✅ Discogs API настройки сохранены', {
      type: 'success',
    })
  }

  const handleTestConnection = async () => {
    if (!consumerKeyInput || !consumerSecretInput) {
      toast('❌ Введите Consumer Key и Consumer Secret', { type: 'error' })
      return
    }

    try {
      // Инициализируем сервис для теста
      discogsService.initialize(consumerKeyInput, consumerSecretInput, tokenInput, tokenSecretInput)
      
      // Пробуем сделать простой запрос
      const artists = await discogsService.searchArtist('test', 1)
      
      if (artists) {
        toast('✅ Discogs подключён успешно!', { type: 'success' })
        setDiscogsEnabled(true)
      } else {
        toast('⚠️ Ошибка подключения к Discogs', { type: 'warning' })
      }
    } catch (error) {
      console.error('Discogs connection error:', error)
      toast('❌ Ошибка подключения: ' + (error as Error).message, { type: 'error' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discogs</CardTitle>
        <CardDescription>
          База данных музыкальных релизов для отслеживания новинок
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Discogs API</Label>
            <p className="text-sm text-muted-foreground">
              Информация о новых релизах и датах выхода
            </p>
          </div>
          <Switch
            checked={settings.discogsEnabled}
            onCheckedChange={setDiscogsEnabled}
          />
        </div>

        {/* OAuth Credentials */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="discogs-consumer-key">Consumer Key</Label>
            <Input
              id="discogs-consumer-key"
              type="text"
              placeholder="Введите Consumer Key"
              value={consumerKeyInput}
              onChange={(e) => setConsumerKeyInput(e.target.value)}
              className="flex-1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="discogs-consumer-secret">Consumer Secret</Label>
            <Input
              id="discogs-consumer-secret"
              type="password"
              placeholder="Введите Consumer Secret"
              value={consumerSecretInput}
              onChange={(e) => setConsumerSecretInput(e.target.value)}
              className="flex-1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="discogs-token">OAuth Token (опционально)</Label>
            <Input
              id="discogs-token"
              type="text"
              placeholder="Введите OAuth Token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="flex-1"
            />
            <p className="text-xs text-muted-foreground">
              Требуется для персонализированных запросов
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discogs-token-secret">OAuth Token Secret (опционально)</Label>
            <Input
              id="discogs-token-secret"
              type="password"
              placeholder="Введите OAuth Token Secret"
              value={tokenSecretInput}
              onChange={(e) => setTokenSecretInput(e.target.value)}
              className="flex-1"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleSave} variant="default">
            Сохранить
          </Button>
          <Button onClick={handleTestConnection} variant="secondary">
            Проверить подключение
          </Button>
        </div>

        {/* Help */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <a
              href="https://www.discogs.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              Получить API ключи →
            </a>
          </p>
          <p>
            Discogs использует OAuth 1.0a для авторизации.
          </p>
          <p>
            Для базового поиска достаточно Consumer Key и Consumer Secret.
          </p>
        </div>

        {/* Status */}
        {settings.discogsEnabled && settings.discogsConsumerKey && (
          <div className="text-xs text-green-600">
            ✅ Discogs подключён
          </div>
        )}
      </CardContent>
    </Card>
  )
}

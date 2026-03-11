import { useState } from 'react'
import { useExternalApi } from '@/store/external-api.store'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { toast } from 'react-toastify'
import { LastFmAuth } from '@/app/components/settings/pages/content/lastfm-auth'
import { ListenBrainzSettings } from '@/app/components/settings/pages/external/listenbrainz'

export default function ExternalApiSettings() {
  const {
    settings,
    setLastFmApiKey,
    setLastFmEnabled,
    setFanartApiKey,
    setFanartClientKey,
    setFanartEnabled,
    setFanartShowBanner,
    resetSettings,
    initializeServices,
  } = useExternalApi()

  const [lastFmInput, setLastFmInput] = useState(settings.lastFmApiKey)
  const [fanartInput, setFanartInput] = useState(settings.fanartApiKey)
  const [fanartClientInput, setFanartClientInput] = useState(settings.fanartClientKey)

  const handleSaveLastFm = () => {
    setLastFmApiKey(lastFmInput)
    toast('✅ Last.fm API ключ сохранён', {
      type: 'success',
    })
  }

  const handleSaveFanart = () => {
    setFanartApiKey(fanartInput)
    toast('✅ Fanart.tv API ключ сохранён', {
      type: 'success',
    })
  }

  const handleSaveFanartClient = () => {
    setFanartClientKey(fanartClientInput)
    toast('✅ Fanart.tv Personal ключ сохранён', {
      type: 'success',
    })
  }

  const handleReset = () => {
    resetSettings()
    setLastFmInput('')
    setFanartInput('')
    toast('🔄 Настройки API сброшены', {
      type: 'info',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Внешние API</CardTitle>
        <CardDescription>
          Интеграция с Last.fm и Fanart.tv для улучшения рекомендаций
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Last.fm */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Last.fm</Label>
              <p className="text-sm text-muted-foreground">
                Похожие артисты, теги, биографии для ML рекомендаций
              </p>
            </div>
            <Switch
              checked={settings.lastFmEnabled}
              onCheckedChange={setLastFmEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastfm-key">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="lastfm-key"
                type="text"
                placeholder="Введите Last.fm API ключ"
                value={lastFmInput}
                onChange={(e) => setLastFmInput(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleSaveLastFm} variant="secondary">
                Сохранить
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <a
                href="https://www.last.fm/api/account/create"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Получить API ключ →
              </a>
            </p>
          </div>

          {settings.lastFmEnabled && settings.lastFmApiKey && (
            <div className="text-xs text-green-600">
              ✅ Last.fm подключён
            </div>
          )}
          
          {!settings.lastFmEnabled && settings.lastFmApiKey && (
            <div className="text-xs text-blue-600">
              ℹ️ Last.fm API ключ сохранён (используется для обложек артистов)
            </div>
          )}

          {/* OAuth авторизация */}
          {settings.lastFmApiKey && (
            <div className="pt-3 border-t">
              <LastFmAuth />
            </div>
          )}
        </div>

        {/* ListenBrainz */}
        <div className="pt-4 border-t">
          <ListenBrainzSettings />
        </div>

        {/* Fanart.tv */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Fanart.tv</Label>
              <p className="text-sm text-muted-foreground">
                HD изображения артистов и альбомов
              </p>
            </div>
            <Switch
              checked={settings.fanartEnabled}
              onCheckedChange={setFanartEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fanart-key">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="fanart-key"
                type="text"
                placeholder="Введите Fanart.tv API ключ"
                value={fanartInput}
                onChange={(e) => setFanartInput(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleSaveFanart} variant="secondary">
                Сохранить
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <a
                href="https://fanart.tv/get-an-api-key/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Получить API ключ →
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fanart-client-key">Personal API Key (опционально)</Label>
            <div className="flex gap-2">
              <Input
                id="fanart-client-key"
                type="text"
                placeholder="Введите Personal ключ для лучшего доступа"
                value={fanartClientInput}
                onChange={(e) => setFanartClientInput(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleSaveFanartClient} variant="secondary">
                Сохранить
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Personal key даёт доступ к новым изображениям через 2 дня вместо 7
            </p>
          </div>

          {settings.fanartEnabled && settings.fanartApiKey && (
            <div className="text-xs text-green-600">
              ✅ Fanart.tv подключён
            </div>
          )}

          {/* Чекбокс "Включить баннер артиста" */}
          {settings.fanartEnabled && settings.fanartApiKey && (
            <div className="flex items-center justify-between pt-2">
              <div>
                <Label htmlFor="fanart-banner" className="text-sm">
                  🎨 Баннер артиста
                </Label>
                <p className="text-xs text-muted-foreground">
                  Показывать HD фон артиста на странице
                </p>
              </div>
              <Switch
                id="fanart-banner"
                checked={settings.fanartShowBanner}
                onCheckedChange={setFanartShowBanner}
              />
            </div>
          )}
        </div>

        {/* Reset Button */}
        <div className="pt-4 border-t">
          <Button onClick={handleReset} variant="outline" className="w-full">
            🔄 Сбросить настройки API
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

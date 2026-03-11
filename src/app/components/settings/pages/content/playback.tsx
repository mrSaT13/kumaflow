import { useTranslation } from 'react-i18next'
import { usePlaybackSettings, usePlaybackActions } from '@/store/playback.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Slider } from '@/app/components/ui/slider'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Move } from 'lucide-react'

export function PlaybackContent() {
  const { t } = useTranslation()
  const { settings } = usePlaybackSettings()
  const {
    setScrobbleEnabled,
    setScrobbleThreshold,
    setGaplessPlayback,
    setCrossfadeEnabled,
    setCrossfadeSeconds,
    setFloatingPlayerEnabled,
  } = usePlaybackActions()

  return (
    <div className="space-y-6">
      {/* Scrobble */}
      <Card>
        <CardHeader>
          <CardTitle>📻 Scrobble (Navidrome)</CardTitle>
          <CardDescription>
            Отправка информации о прослушиваниях на сервер
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Включить scrobble</Label>
              <p className="text-sm text-muted-foreground">
                Автоматически отправлять данные о прослушиваниях в Navidrome
              </p>
            </div>
            <Switch
              checked={settings.scrobbleEnabled}
              onCheckedChange={setScrobbleEnabled}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Порог прослушивания: {settings.scrobbleThresholdSeconds} сек</Label>
              <Badge variant="secondary">
                {settings.scrobbleThresholdSeconds}s
              </Badge>
            </div>
            <Slider
              value={[settings.scrobbleThresholdSeconds]}
              min={0}
              max={60}
              step={5}
              onValueChange={(val) => setScrobbleThreshold(val[0])}
              disabled={!settings.scrobbleEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Трек считается прослушанным после {settings.scrobbleThresholdSeconds} секунд воспроизведения
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Gapless Playback */}
      <Card>
        <CardHeader>
          <CardTitle>🎵 Gapless Playback</CardTitle>
          <CardDescription>
            Воспроизведение без пауз между треками
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Бесшовное воспроизведение</Label>
              <p className="text-sm text-muted-foreground">
                Автоматически переходить между треками без пауз
              </p>
            </div>
            <Switch
              checked={settings.gaplessPlayback}
              onCheckedChange={setGaplessPlayback}
            />
          </div>
        </CardContent>
      </Card>

      {/* Floating Player - ВРЕМЕННО ОТКЛЮЧЕН (не работает) */}
      {/* <Card>
        <CardHeader>
          <CardTitle>🎈 Floating Player</CardTitle>
          <CardDescription>
            Плавающий плеер поверх всех страниц
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Включить плавающий плеер</Label>
              <p className="text-sm text-muted-foreground">
                Отображать компактный плеер поверх всех страниц с возможностью перетаскивания
              </p>
            </div>
            <Switch
              checked={settings.floatingPlayerEnabled}
              onCheckedChange={setFloatingPlayerEnabled}
            />
          </div>

          {settings.floatingPlayerEnabled && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <Move className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Перетаскивайте плеер за верхнюю панель. Закройте крестиком или отключите в настройках.
              </p>
            </div>
          )}
        </CardContent>
      </Card> */}

      {/* ⚠️ ЗАКОММЕНТИРОВАНО: Crossfade требует архитектурных изменений */}
      {/* Crossfade */}
      {/* <Card>
        <CardHeader>
          <CardTitle>🔀 Crossfade</CardTitle>
          <CardDescription>
            Плавный переход между треками
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Включить crossfade</Label>
              <p className="text-sm text-muted-foreground">
                Плавное затухание текущего трека и появление следующего
              </p>
            </div>
            <Switch
              checked={settings.crossfadeEnabled}
              onCheckedChange={setCrossfadeEnabled}
            />
          </div>

          {settings.crossfadeEnabled && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Длительность: {settings.crossfadeSeconds} сек</Label>
                <Badge variant="secondary">
                  {settings.crossfadeSeconds}s
                </Badge>
              </div>
              <Slider
                value={[settings.crossfadeSeconds]}
                min={0}
                max={15}
                step={1}
                onValueChange={(val) => setCrossfadeSeconds(val[0])}
              />
            </div>
          )}
        </CardContent>
      </Card> */}
    </div>
  )
}

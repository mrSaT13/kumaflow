import { useState } from 'react'
import { useML } from '@/store/ml.store'
import { useMLPlaylists } from '@/store/ml-playlists.store'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Slider } from '@/app/components/ui/slider'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { trackEvent } from '@/service/ml-event-tracker'
import { Sparkles } from 'lucide-react'
import { LastFmTagsImport } from '@/app/components/settings/pages/content/lastfm-tags-import'

export default function MLPlaylistsSettings() {
  const {
    settings,
    setMinTracks,
    setMaxTracks,
    setAutoUpdateHours,
    setRemoveDuplicates,
    setScanLibrary,
  } = useMLPlaylists()

  const { exportProfile, importProfile, resetProfile } = useML()

  const handleResetPreferences = () => {
    // Используем window.location.hash вместо useNavigate
    window.location.hash = '/artists/cold-start'
  }

  const handleExportProfile = () => {
    try {
      const data = exportProfile()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ml-profile-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      trackEvent('export_completed', { timestamp: new Date().toISOString() })
      toast('✅ Профиль экспортирован', {
        type: 'success',
      })
    } catch (error) {
      toast('❌ Ошибка экспорта', {
        type: 'error',
      })
    }
  }

  const handleImportProfile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result as string
        importProfile(data)

        trackEvent('import_completed', { timestamp: new Date().toISOString() })
        toast('✅ Профиль импортирован', {
          type: 'success',
        })
      } catch (error) {
        toast('❌ Ошибка импорта', {
          type: 'error',
        })
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>✨ ML Плейлисты</CardTitle>
        <CardDescription>
          Настройки персональных плейлистов с рекомендациями
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Минимум треков: {settings.minTracks}</Label>
          </div>
          <Slider
            value={[settings.minTracks]}
            min={10}
            max={100}
            step={5}
            onValueChange={(val) => setMinTracks(val[0])}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Максимум треков: {settings.maxTracks}</Label>
          </div>
          <Slider
            value={[settings.maxTracks]}
            min={50}
            max={500}
            step={10}
            onValueChange={(val) => setMaxTracks(val[0])}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Автообновление: каждые {settings.autoUpdateHours} ч</Label>
          </div>
          <Slider
            value={[settings.autoUpdateHours]}
            min={1}
            max={168}
            step={1}
            onValueChange={(val) => setAutoUpdateHours(val[0])}
          />
          <p className="text-sm text-muted-foreground">
            От 1 часа до 7 дней
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">Удалять дубликаты</div>
            <div className="text-sm text-muted-foreground">
              Автоматически находить и удалять дубли плейлистов
            </div>
          </div>
          <Switch
            checked={settings.removeDuplicates}
            onCheckedChange={setRemoveDuplicates}
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">Сканирование библиотеки</div>
            <div className="text-sm text-muted-foreground">
              Анализировать треки для ML рекомендаций
            </div>
          </div>
          <Switch
            checked={settings.scanLibrary}
            onCheckedChange={setScanLibrary}
          />
        </div>

        <div className="pt-4 border-t space-y-3">
          <Button
            onClick={handleResetPreferences}
            variant="outline"
            className="w-full"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Уточнить предпочтения
          </Button>

          <div className="flex gap-2">
            <Button
              onClick={handleExportProfile}
              variant="outline"
              className="flex-1"
              size="sm"
            >
              📥 Экспорт
            </Button>

            <label className="flex-1">
              <input
                type="file"
                accept=".json"
                onChange={handleImportProfile}
                className="hidden"
              />
              <Button
                asChild
                variant="outline"
                className="w-full"
                size="sm"
              >
                <span>📤 Импорт</span>
              </Button>
            </label>
          </div>
        </div>

        {/* Last.fm Теги */}
        <div className="pt-4 border-t">
          <LastFmTagsImport />
        </div>
      </CardContent>
    </Card>
  )
}

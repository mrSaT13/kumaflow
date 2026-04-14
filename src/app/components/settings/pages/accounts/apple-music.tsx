import { useExternalApi } from '@/store/external-api.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { appleMusicService } from '@/service/apple-music-api'
import { COUNTRY_CODES, type CountryCode } from '@/service/apple-music-api'
import { toast } from 'react-toastify'

// Список стран для отображения
const COUNTRIES: Record<CountryCode, string> = {
  RU: 'Россия',
  US: 'США',
  GB: 'Великобритания',
  DE: 'Германия',
  FR: 'Франция',
  ES: 'Испания',
  IT: 'Италия',
  JP: 'Япония',
  CN: 'Китай',
  BR: 'Бразилия',
  AU: 'Австралия',
  CA: 'Канада',
  IN: 'Индия',
  MX: 'Мексика',
  KR: 'Корея',
}

export function AppleMusicSettings() {
  const { settings, setAppleMusicEnabled, setAppleMusicCountry } = useExternalApi()

  const handleTestConnection = async () => {
    try {
      // Пробуем сделать простой запрос
      const artists = await appleMusicService.searchArtist('test', 1)

      if (artists && artists.length > 0) {
        toast('✅ Apple Music подключён успешно!', { type: 'success' })
        setAppleMusicEnabled(true)
      } else {
        toast('⚠️ Ошибка подключения к Apple Music', { type: 'warning' })
      }
    } catch (error) {
      console.error('Apple Music connection error:', error)
      toast('❌ Ошибка подключения: ' + (error as Error).message, { type: 'error' })
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Apple Music (iTunes)</CardTitle>
        <CardDescription>
          Поиск треков и альбомов через iTunes Search API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Apple Music API</Label>
            <p className="text-sm text-muted-foreground">
              Информация о новых релизах и треках (не требует API ключей)
            </p>
          </div>
          <Switch
            checked={settings.appleMusicEnabled}
            onCheckedChange={setAppleMusicEnabled}
          />
        </div>

        {/* Выбор страны */}
        <div className="space-y-2">
          <Label htmlFor="apple-music-country">Страна для локализации</Label>
          <Select
            value={settings.appleMusicCountry}
            onValueChange={(value: CountryCode) => setAppleMusicCountry(value)}
            disabled={!settings.appleMusicEnabled}
          >
            <SelectTrigger id="apple-music-country" className="w-full">
              <SelectValue placeholder="Выберите страну" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(COUNTRIES).map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Влияет на язык жанров и доступность контента
          </p>
        </div>

        {/* Test Button */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleTestConnection}
            className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors whitespace-nowrap"
          >
            Проверить подключение
          </button>
        </div>

        {/* Help */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <a
              href="https://performance-partners.apple.com/search-api"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              Документация Apple Music Search API →
            </a>
          </p>
          <p>
            Публичный API — не требует регистрации или API ключей.
          </p>
          <p>
            Rate Limit: 20 запросов в секунду.
          </p>
        </div>

        {/* Status */}
        {settings.appleMusicEnabled && (
          <div className="text-xs text-green-600">
            ✅ Apple Music включён (страна: {COUNTRIES[settings.appleMusicCountry]})
          </div>
        )}
      </CardContent>
    </Card>
  )
}

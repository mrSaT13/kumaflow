/**
 * Настройки кеша
 */

import { Trash2, Download, Upload, Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Slider } from '@/app/components/ui/slider'
import { Switch } from '@/app/components/ui/switch'
import { cacheService } from '@/service/cache-service'
import type { CacheSettings } from '@/service/cache-service'
import { useAppStore } from '@/store/app.store'

export function CacheSettings() {
  const [settings, setSettings] = useState<CacheSettings>({
    maxTracks: 1000,
    maxArtists: 500,
    maxCacheSizeMB: 100,
    ttlHours: 168,
  })
  const [isLoading, setIsLoading] = useState(false)
  const autoCacheStarred = useAppStore().pages.autoCacheStarred
  const setAutoCacheStarred = useAppStore().pages.setAutoCacheStarred

  // Загружаем настройки
  useEffect(() => {
    setSettings(cacheService.getSettings())
  }, [])

  const handleUpdateSetting = (key: keyof CacheSettings, value: number) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    cacheService.updateSettings(newSettings)
    // Убрали toast - слишком много уведомлений
  }

  const handleToggleAutoCache = (checked: boolean) => {
    setAutoCacheStarred(checked)
    // Убрали toast - было слишком много дублей
  }

  const handleClearCache = () => {
    if (!confirm('Вы уверены что хотите очистить весь кеш?')) return

    const result = cacheService.clearCache()
    toast.success(`Кеш очищен: ${result.tracks} треков, ${result.artists} артистов`)
  }

  const handleExportCache = () => {
    setIsLoading(true)
    
    try {
      const tracks = cacheService.getCachedTracks()
      const artists = cacheService.getCachedArtists()
      
      const data = {
        exportedAt: new Date().toISOString(),
        settings: cacheService.getSettings(),
        tracks,
        artists,
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kumaflow-cache-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      
      toast.success('Кеш экспортирован')
    } catch (error) {
      console.error('[CacheSettings] Failed to export cache:', error)
      toast.error('Ошибка экспорта кеша')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Настройки */}
      <Card>
        <CardHeader>
          <CardTitle>Настройки кеша</CardTitle>
          <CardDescription>
            Управление параметрами кеширования
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Автосохранение лайкнутых */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                <label className="text-sm font-medium">
                  Автосохранение лайкнутых треков
                </label>
              </div>
              <Switch
                checked={autoCacheStarred}
                onCheckedChange={handleToggleAutoCache}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              При включении лайкнутые треки автоматически сохраняются в кеш
            </p>
          </div>

          {/* Максимум треков */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">
                Максимум треков в кеше
              </label>
              <span className="text-sm text-muted-foreground">
                {settings.maxTracks}
              </span>
            </div>
            <Slider
              value={[settings.maxTracks]}
              min={100}
              max={10000}
              step={100}
              onValueChange={([value]) => handleUpdateSetting('maxTracks', value)}
            />
          </div>

          {/* Максимум артистов */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">
                Максимум артистов в кеше
              </label>
              <span className="text-sm text-muted-foreground">
                {settings.maxArtists}
              </span>
            </div>
            <Slider
              value={[settings.maxArtists]}
              min={50}
              max={5000}
              step={50}
              onValueChange={([value]) => handleUpdateSetting('maxArtists', value)}
            />
          </div>

          {/* Размер кеша */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">
                Максимальный размер кеша (MB)
              </label>
              <span className="text-sm text-muted-foreground">
                {settings.maxCacheSizeMB} MB
              </span>
            </div>
            <Slider
              value={[settings.maxCacheSizeMB]}
              min={10}
              max={1000}
              step={10}
              onValueChange={([value]) => handleUpdateSetting('maxCacheSizeMB', value)}
            />
          </div>

          {/* TTL */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">
                Время хранения кеша (часы)
              </label>
              <span className="text-sm text-muted-foreground">
                {settings.ttlHours} ч
              </span>
            </div>
            <Slider
              value={[settings.ttlHours]}
              min={1}
              max={720}
              step={24}
              onValueChange={([value]) => handleUpdateSetting('ttlHours', value)}
            />
            <p className="text-xs text-muted-foreground">
              {settings.ttlHours >= 168 
                ? `${Math.round(settings.ttlHours / 24)} дней(я)` 
                : `${settings.ttlHours} часов`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Управление */}
      <Card>
        <CardHeader>
          <CardTitle>Управление кешем</CardTitle>
          <CardDescription>
            Очистка, экспорт и импорт кеша
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={handleClearCache}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Очистить весь кеш
            </Button>

            <Button
              variant="outline"
              onClick={handleExportCache}
              disabled={isLoading}
            >
              <Download className="w-4 h-4 mr-2" />
              {isLoading ? 'Экспорт...' : 'Экспорт кеша'}
            </Button>

            <Button variant="outline" disabled>
              <Upload className="w-4 h-4 mr-2" />
              Импорт кеша (в разработке)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

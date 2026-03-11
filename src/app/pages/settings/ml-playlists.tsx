import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useML } from '@/store/ml.store'
import { useMLPlaylists } from '@/store/ml-playlists.store'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Slider } from '@/app/components/ui/slider'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Progress } from '@/app/components/ui/progress'
import { Badge } from '@/app/components/ui/badge'

export default function MLPlaylistsSettings() {
  const { t } = useTranslation()
  const {
    settings,
    playlists,
    setMinTracks,
    setMaxTracks,
    setAutoUpdateHours,
    setRemoveDuplicates,
    setScanLibrary,
    startScan,
    stopScan,
    setScanProgress,
    removeDuplicatePlaylists,
    resetSettings,
  } = useMLPlaylists()

  const { exportProfile, importProfile, resetProfile } = useML()
  const [isScanning, setIsScanning] = useState(false)

  const handleStartScan = () => {
    setIsScanning(true)
    startScan()

    // Имитация сканирования
    let progress = 0
    const interval = setInterval(() => {
      progress += 5
      setScanProgress(progress)

      if (progress >= 100) {
        clearInterval(interval)
        setIsScanning(false)
        stopScan()
      }
    }, 500)
  }

  const handleColdStart = () => {
    // Используем hash вместо navigate
    window.location.hash = '/artists/cold-start'
  }

  const handleStopScan = () => {
    setIsScanning(false)
    stopScan()
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
    
    // Сбрасываем input
    event.target.value = ''
  }

  const duplicateCount = playlists.filter((p) => p.duplicateOf).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">ML Плейлисты</h2>
        <p className="text-muted-foreground">
          Настройки персональных плейлистов с рекомендациями
        </p>
      </div>

      {/* Основные настройки */}
      <Card>
        <CardHeader>
          <CardTitle>Генерация плейлистов</CardTitle>
          <CardDescription>
            Количество треков в ML плейлистах
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
        </CardContent>
      </Card>

      {/* Сканирование библиотеки */}
      <Card>
        <CardHeader>
          <CardTitle>Сканирование библиотеки</CardTitle>
          <CardDescription>
            Анализ треков, чтение тегов и BPM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Включить сканирование</div>
              <div className="text-sm text-muted-foreground">
                Автоматически сканировать библиотеку для ML
              </div>
            </div>
            <Switch
              checked={settings.scanLibrary}
              onCheckedChange={setScanLibrary}
            />
          </div>

          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-purple-600 mb-1">
                  🚀 Холодный старт
                </h4>
                <p className="text-sm text-muted-foreground">
                  Пройдите онбординг для настройки персональных рекомендаций
                </p>
              </div>
              <Button
                onClick={handleColdStart}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                🎯 Запустить холодный старт
              </Button>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Выбор любимых жанров (3+)</li>
                <li>• Выбор артистов (5+)</li>
                <li>• Сканирование библиотеки</li>
                <li>• Генерация первых рекомендаций</li>
              </ul>
            </div>
          </div>

          {settings.scanLibrary && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Прогресс сканирования</Label>
                  <Badge variant={settings.isScanning ? 'default' : 'secondary'}>
                    {settings.isScanning ? 'Сканирование...' : 'Готово'}
                  </Badge>
                </div>
                <Progress value={settings.scanProgress} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {settings.scanProgress}% завершено
                </p>
              </div>

              <div className="flex gap-2">
                {!isScanning ? (
                  <Button onClick={handleStartScan} className="w-full">
                    📊 Начать сканирование
                  </Button>
                ) : (
                  <Button 
                    onClick={handleStopScan} 
                    variant="destructive"
                    className="w-full"
                  >
                    ⏹️ Остановить
                  </Button>
                )}
              </div>

              {settings.lastScanDate && (
                <p className="text-sm text-muted-foreground">
                  Последнее сканирование: {new Date(settings.lastScanDate).toLocaleString('ru-RU')}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Дубликаты */}
      <Card>
        <CardHeader>
          <CardTitle>Управление дубликатами</CardTitle>
          <CardDescription>
            Поиск и удаление дубликатов плейлистов
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
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

          {duplicateCount > 0 && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-yellow-600">
                    Найдено дубликатов: {duplicateCount}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Можно безопасно удалить
                  </p>
                </div>
                <Button
                  onClick={removeDuplicatePlaylists}
                  variant="destructive"
                  size="sm"
                >
                  🗑️ Удалить дубли
                </Button>
              </div>
            </div>
          )}

          {playlists.length > 0 && (
            <div className="space-y-2">
              <Label>ML Плейлисты ({playlists.length})</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{playlist.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {playlist.trackCount} треков • Обновлено: {new Date(playlist.lastUpdated).toLocaleDateString('ru-RU')}
                      </p>
                      {playlist.duplicateOf && (
                        <Badge variant="destructive" className="mt-1">
                          Дубликат
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {}}
                    >
                      🗑️
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Сброс настроек */}
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Сброс настроек</CardTitle>
          <CardDescription>
            Вернуть настройки по умолчанию или начать онбординг заново
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={resetSettings}
              variant="destructive"
              className="flex-1"
            >
              ⚠️ Сбросить настройки ML
            </Button>
            <Button
              onClick={handleColdStart}
              variant="outline"
              className="flex-1"
            >
              🔄 Пройти онбординг заново
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Экспорт/Импорт профиля */}
      <Card>
        <CardHeader>
          <CardTitle>💾 Экспорт/Импорт ML профиля</CardTitle>
          <CardDescription>
            Сохраните или загрузите ML профиль для синхронизации между устройствами
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <h4 className="font-medium text-blue-600 mb-2">
              📊 Что сохраняется в профиле:
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Лайкнутые треки</li>
              <li>• Дизлайкнутые треки</li>
              <li>• История прослушиваний</li>
              <li>• Предпочтения по жанрам</li>
              <li>• Предпочтения по артистам</li>
              <li>• Счётчики воспроизведений и скипов</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleExportProfile}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              📥 Экспорт профиля
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
              >
                <span>📤 Импорт профиля</span>
              </Button>
            </label>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Файл профиля будет сохранён в папку загрузок
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

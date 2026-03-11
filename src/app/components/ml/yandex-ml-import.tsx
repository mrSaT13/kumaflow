import { useState } from 'react'
import { useYandexMusicStore } from '@/store/yandex-music.store'
import { mlEnrichmentService } from '@/service/ml-enrichment'
import { useMLStore } from '@/store/ml.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { Progress } from '@/app/components/ui/progress'
import { Music, Download, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-toastify'

export function YandexMLImport() {
  const { settings } = useYandexMusicStore()
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{
    artistsScanned: number
    artistsFound: number
    genresDiscovered: string[]
  } | null>(null)

  const handleImport = async () => {
    if (!settings.yandexMusicEnabled) {
      toast('⚠️ Яндекс.Музыка не подключена', { type: 'warning' })
      return
    }

    setIsImporting(true)
    setProgress(0)

    try {
      // Имитация прогресса
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 90))
      }, 300)

      const importResult = await mlEnrichmentService.importArtistGenresFromYandex(100)
      
      clearInterval(progressInterval)
      setProgress(100)
      setResult(importResult)
      
      if (importResult.artistsFound > 0 || importResult.genresDiscovered.length > 0) {
        toast('✅ ML модель обновлена жанрами из Яндекс!', { type: 'success' })
        
        // Принудительно обновляем страницу через 2 секунды
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    } catch (error) {
      console.error('[YandexMLImport] Error:', error)
      toast('❌ Ошибка: ' + (error as Error).message, { type: 'error' })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Импорт жанров из Яндекс.Музыки
        </CardTitle>
        <CardDescription>
          Сканирует артистов из Navidrome и получает жанры из Яндекс.Музыки
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settings.yandexMusicEnabled ? (
          <div className="text-sm text-yellow-600">
            ⚠️ Яндекс.Музыка не подключена. Включи в настройках → Учётки.
          </div>
        ) : result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span>Импорт завершён!</span>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{result.artistsScanned}</div>
                <div className="text-xs text-muted-foreground">Отсканировано</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{result.artistsFound}</div>
                <div className="text-xs text-muted-foreground">Найдено</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{result.genresDiscovered.length}</div>
                <div className="text-xs text-muted-foreground">Жанров</div>
              </div>
            </div>

            {result.genresDiscovered.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {result.genresDiscovered.slice(0, 15).map(genre => (
                  <Badge key={genre} variant="secondary" className="text-xs">
                    {genre}
                  </Badge>
                ))}
                {result.genresDiscovered.length > 15 && (
                  <Badge variant="outline" className="text-xs">
                    +{result.genresDiscovered.length - 15}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Жанры не найдены. У артистов нет данных в Яндекс.Музыке.
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Статистика обновится автоматически...
            </div>

            <Button 
              onClick={handleImport} 
              disabled={isImporting}
              variant="outline"
              size="sm"
            >
              Импортировать ещё раз
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Сканирует до 100 артистов из твоей библиотеки и получает их жанры из Яндекс.Музыки для улучшения ML рекомендаций.
            </div>

            {isImporting && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <div className="text-xs text-muted-foreground text-center">
                  Сканирование... {progress}%
                </div>
              </div>
            )}

            <Button 
              onClick={handleImport} 
              disabled={isImporting}
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              {isImporting ? 'Сканирование...' : 'Импортировать жанры'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

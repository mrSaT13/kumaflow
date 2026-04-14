import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { toast } from 'react-toastify'
import { importArtistTagsFromLastFm, importTrackTagsFromLastFm, importAllLibraryTagsFromLastFm } from '@/service/lastfm-tags-import'
import { useExternalApi } from '@/store/external-api.store'
import { Loader2 } from 'lucide-react'

/**
 * Компонент импорта жанров и настроений из Last.fm
 */
export function LastFmTagsImport() {
  const { settings } = useExternalApi()
  const [isImportingGenres, setIsImportingGenres] = useState(false)
  const [isImportingMoods, setIsImportingMoods] = useState(false)
  const [isImportingLibrary, setIsImportingLibrary] = useState(false)

  const isLastFmAuthorized = settings.lastFmEnabled && settings.lastFmApiKey

  /**
   * Импорт жанров для лайкнутых артистов
   */
  async function handleImportGenres() {
    if (!isLastFmAuthorized) {
      toast.error('Last.fm не авторизован', { type: 'error' })
      return
    }

    setIsImportingGenres(true)
    try {
      const result = await importArtistTagsFromLastFm()
      
      if (result.success) {
        toast.success(
          `Импортировано ${result.genresAdded} жанров для ${result.artistsProcessed} артистов`,
          { type: 'success', autoClose: 5000 }
        )
      } else {
        toast.error(`Ошибка: ${result.error}`, { type: 'error', autoClose: 5000 })
      }
    } catch (error) {
      console.error('[LastFmTagsImport] Error:', error)
      toast.error('Ошибка при импорте жанров', { type: 'error' })
    } finally {
      setIsImportingGenres(false)
    }
  }

  /**
   * Импорт настроений для треков
   */
  async function handleImportMoods() {
    if (!isLastFmAuthorized) {
      toast.error('Last.fm не авторизован', { type: 'error' })
      return
    }

    setIsImportingMoods(true)
    try {
      const result = await importTrackTagsFromLastFm()
      
      if (result.success) {
        toast.success(
          `Импортировано ${result.moodsAdded} настроений для ${result.tracksProcessed} треков`,
          { type: 'success', autoClose: 5000 }
        )
      } else {
        toast.error(`Ошибка: ${result.error}`, { type: 'error', autoClose: 5000 })
      }
    } catch (error) {
      console.error('[LastFmTagsImport] Error:', error)
      toast.error('Ошибка при импорте настроений', { type: 'error' })
    } finally {
      setIsImportingMoods(false)
    }
  }

  /**
   * Массовый импорт по всей библиотеке
   */
  async function handleImportLibrary() {
    if (!isLastFmAuthorized) {
      toast.error('Last.fm не авторизован', { type: 'error' })
      return
    }

    setIsImportingLibrary(true)
    try {
      const result = await importAllLibraryTagsFromLastFm()
      
      if (result.success) {
        toast.success(
          `Импортировано ${result.genresAdded} жанров и ${result.moodsAdded} настроений`,
          { type: 'success', autoClose: 10000 }
        )
      } else {
        toast.error(`Ошибка: ${result.error}`, { type: 'error', autoClose: 5000 })
      }
    } catch (error) {
      console.error('[LastFmTagsImport] Error:', error)
      toast.error('Ошибка при импорте', { type: 'error' })
    } finally {
      setIsImportingLibrary(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last.fm Теги</CardTitle>
        <CardDescription>
          Импорт жанров и настроений из Last.fm для улучшения рекомендаций
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Проверка авторизации */}
        {!isLastFmAuthorized && (
          <div className="text-sm text-amber-600">
            Требуется авторизация Last.fm в разделе "Внешние API"
          </div>
        )}

        {/* Импорт жанров */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Жанры артистов</h4>
          <p className="text-xs text-muted-foreground">
            Получить жанры для всех лайкнутых артистов из Last.fm
          </p>
          <Button
            onClick={handleImportGenres}
            disabled={!isLastFmAuthorized || isImportingGenres}
            className="w-full sm:w-auto"
          >
            {isImportingGenres ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Импорт...
              </>
            ) : (
              'Импортировать жанры'
            )}
          </Button>
        </div>

        {/* Импорт настроений */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Настроения треков</h4>
          <p className="text-xs text-muted-foreground">
            Получить настроения для треков из истории прослушиваний
          </p>
          <Button
            onClick={handleImportMoods}
            disabled={!isLastFmAuthorized || isImportingMoods}
            className="w-full sm:w-auto"
          >
            {isImportingMoods ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Импорт...
              </>
            ) : (
              'Импортировать настроения'
            )}
          </Button>
        </div>

        {/* Массовый импорт */}
        <div className="space-y-2 pt-2 border-t">
          <h4 className="text-sm font-medium">Массовый импорт</h4>
          <p className="text-xs text-muted-foreground">
            Импортировать жанры и настроения для всей библиотеки
          </p>
          <Button
            onClick={handleImportLibrary}
            disabled={!isLastFmAuthorized || isImportingLibrary}
            variant="default"
            className="w-full sm:w-auto"
          >
            {isImportingLibrary ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Импорт библиотеки...
              </>
            ) : (
              'Импортировать всю библиотеку'
            )}
          </Button>
        </div>

        {/* Информация */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Жанры:</strong> industrial, alternative, rock, metal, etc.</p>
          <p><strong>Настроения:</strong> chill, energetic, melancholic, happy, etc.</p>
          <p><strong>Время импорта:</strong> ~1 минута на 50 артистов/треков</p>
        </div>
      </CardContent>
    </Card>
  )
}

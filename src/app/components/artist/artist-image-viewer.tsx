/**
 * Компонент просмотра обложки артиста с переключением источников
 *
 * Источники:
 * - MusicBrainz (основной)
 * - Apple Music
 * - Last.fm
 * - Fanart.tv (логотипы)
 * - Discogs
 */

import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2, ImageOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/lib/utils'
import { appleMusicService } from '@/service/apple-music-api'
import { lastFmService } from '@/service/lastfm-api'
import { fanartService } from '@/service/fanart-api'
import { discogsService } from '@/service/discogs-api'
import { useExternalApi } from '@/store/external-api.store'
import { trackViewArtistImages } from '@/service/ml-event-tracker'

interface ArtistImageViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  artistName: string
  artistId?: string
  defaultImageUrl?: string
}

type ImageSource = 'musicbrainz' | 'appleMusic' | 'lastfm' | 'fanart' | 'discogs'

interface ImageSourceData {
  id: ImageSource
  name: string
  url?: string
  loading: boolean
  error: boolean
}

export function ArtistImageViewer({
  open,
  onOpenChange,
  artistName,
  artistId,
  defaultImageUrl,
}: ArtistImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sources, setSources] = useState<ImageSourceData[]>([])

  // Сброс и инициализация при открытии ИЛИ при смене артиста
  useEffect(() => {
    if (open) {
      setCurrentIndex(0)

      const initialSources: ImageSourceData[] = [
        {
          id: 'musicbrainz',
          name: 'MusicBrainz',
          url: defaultImageUrl,
          loading: false,
          error: !defaultImageUrl,
        },
        {
          id: 'appleMusic',
          name: 'Apple Music',
          loading: true,
          error: false,
        },
        {
          id: 'lastfm',
          name: 'Last.fm',
          loading: true,
          error: false,
        },
        {
          id: 'fanart',
          name: 'Fanart.tv',
          loading: true,
          error: false,
        },
        {
          id: 'discogs',
          name: 'Discogs',
          loading: true,
          error: false,
        },
      ]

      setSources(initialSources)

      // Загружаем изображения из других источников
      loadAppleMusicImage()
      loadLastFmImage()
      loadFanartImage()
      loadDiscogsImage()

      // Трекаем открытие просмотрщика
      trackViewArtistImages(artistId || 'unknown', initialSources.length)
      console.log('[ArtistImageViewer] Opened for artist:', artistName, 'ID:', artistId)
    }
  }, [open, artistName, defaultImageUrl, artistId])

  // Загрузка Apple Music
  const loadAppleMusicImage = async () => {
    if (!artistName) return
    
    try {
      const artists = await appleMusicService.searchArtist(artistName, 1)
      if (artists && artists.length > 0) {
        const imageUrl = artists[0].artwork?.url
          ?.replace('{w}', '1000')
          ?.replace('{h}', '1000')
        
        setSources(prev => prev.map(s => 
          s.id === 'appleMusic' 
            ? { ...s, loading: false, url: imageUrl, error: !imageUrl }
            : s
        ))
      } else {
        setSources(prev => prev.map(s => 
          s.id === 'appleMusic' ? { ...s, loading: false, error: true } : s
        ))
      }
    } catch (error) {
      console.error('[ArtistImageViewer] Apple Music error:', error)
      setSources(prev => prev.map(s => 
        s.id === 'appleMusic' ? { ...s, loading: false, error: true } : s
      ))
    }
  }

  // Загрузка Last.fm
  const loadLastFmImage = async () => {
    if (!artistName) return

    setSources(prev => prev.map(s =>
      s.id === 'lastfm' ? { ...s, loading: true } : s
    ))

    try {
      console.log('[ArtistImageViewer] Loading Last.fm image for:', artistName)

      const { lastFmService } = await import('@/service/lastfm-api')
      const { useExternalApiStore } = await import('@/store/external-api.store')

      // Проверяем что сервис инициализирован
      const lastFmSettings = useExternalApiStore.getState().settings

      if (!lastFmService.isInitialized()) {
        console.log('[ArtistImageViewer] Last.fm not initialized, initializing...')
        if (lastFmSettings.lastFmApiKey) {
          lastFmService.initialize(lastFmSettings.lastFmApiKey, lastFmSettings.lastFmApiSecret)
        }
      }

      const lastFmInfo = await lastFmService.getArtistInfo(artistName)
      console.log('[ArtistImageViewer] Last.fm response:', lastFmInfo)

      if (lastFmInfo?.image) {
        // Проверяем что это URL а не HTML
        const imageUrl = lastFmInfo.image
        if (imageUrl.startsWith('http')) {
          console.log('[ArtistImageViewer] Last.fm image URL:', imageUrl)
          setSources(prev => prev.map(s =>
            s.id === 'lastfm'
              ? { ...s, loading: false, url: imageUrl, error: !imageUrl }
              : s
          ))
        } else {
          console.log('[ArtistImageViewer] Last.fm returned invalid URL:', imageUrl)
          setSources(prev => prev.map(s =>
            s.id === 'lastfm' ? { ...s, loading: false, error: true } : s
          ))
        }
      } else {
        console.log('[ArtistImageViewer] Last.fm no image found')
        setSources(prev => prev.map(s =>
          s.id === 'lastfm' ? { ...s, loading: false, error: true } : s
        ))
      }
    } catch (error) {
      console.error('[ArtistImageViewer] Last.fm error:', error)
      setSources(prev => prev.map(s =>
        s.id === 'lastfm' ? { ...s, loading: false, error: true } : s
      ))
    }
  }

  // Загрузка Fanart.tv (логотипы)
  const loadFanartImage = async () => {
    if (!artistName) return

    try {
      console.log('[ArtistImageViewer] Loading Fanart.tv image for:', artistName)
      
      // Сначала получаем MBID из Last.fm
      const { lastFmService } = await import('@/service/lastfm-api')
      const lastFmInfo = await lastFmService.getArtistInfo(artistName)
      
      const mbid = lastFmInfo?.mbid
      if (!mbid) {
        console.log('[ArtistImageViewer] Fanart.tv: No MBID from Last.fm')
        setSources(prev => prev.map(s =>
          s.id === 'fanart' ? { ...s, loading: false, error: true } : s
        ))
        return
      }

      console.log('[ArtistImageViewer] Fanart.tv MBID from Last.fm:', mbid)
      
      const images = await fanartService.getArtistImages(mbid)
      console.log('[ArtistImageViewer] Fanart.tv response:', images)
      
      // Берём лучшее изображение (с наибольшим количеством лайков)
      if (images?.logos?.[0]) {
        const bestLogo = images.logos[0]
        console.log('[ArtistImageViewer] Fanart.tv best logo:', bestLogo.url, `${bestLogo.width}x${bestLogo.height}`, `${bestLogo.likes} likes`)
        setSources(prev => prev.map(s =>
          s.id === 'fanart'
            ? { ...s, loading: false, url: bestLogo.url, error: false }
            : s
        ))
      } else {
        console.log('[ArtistImageViewer] Fanart.tv no logos found')
        setSources(prev => prev.map(s =>
          s.id === 'fanart' ? { ...s, loading: false, error: true } : s
        ))
      }
    } catch (error) {
      console.error('[ArtistImageViewer] Fanart.tv error:', error)
      setSources(prev => prev.map(s =>
        s.id === 'fanart' ? { ...s, loading: false, error: true } : s
      ))
    }
  }

  // Загрузка Discogs
  const loadDiscogsImage = async () => {
    if (!artistName) return

    try {
      console.log('[ArtistImageViewer] Loading Discogs image for:', artistName)
      
      const { useExternalApiStore } = await import('@/store/external-api.store')
      const discogsSettings = useExternalApiStore.getState().settings
      
      if (!discogsSettings.discogsEnabled || !discogsSettings.discogsConsumerKey) {
        console.log('[ArtistImageViewer] Discogs not enabled')
        setSources(prev => prev.map(s =>
          s.id === 'discogs' ? { ...s, loading: false, error: true } : s
        ))
        return
      }

      // Ищем артиста в Discogs
      const artists = await discogsService.searchArtist(artistName, 1)
      console.log('[ArtistImageViewer] Discogs search results:', artists)
      
      if (artists?.[0]?.images?.[0]?.uri) {
        const imageUrl = artists[0].images[0].uri
        setSources(prev => prev.map(s =>
          s.id === 'discogs'
            ? { ...s, loading: false, url: imageUrl, error: false }
            : s
        ))
      } else {
        console.log('[ArtistImageViewer] Discogs no image found')
        setSources(prev => prev.map(s =>
          s.id === 'discogs' ? { ...s, loading: false, error: true } : s
        ))
      }
    } catch (error) {
      console.error('[ArtistImageViewer] Discogs error:', error)
      setSources(prev => prev.map(s =>
        s.id === 'discogs' ? { ...s, loading: false, error: true } : s
      ))
    }
  }

  // Переключение на предыдущий источник
  const handlePrevious = () => {
    setCurrentIndex(prev => {
      let newIndex = prev - 1
      if (newIndex < 0) newIndex = sources.length - 1

      // Пропускаем источники с ошибкой
      let attempts = 0
      while (sources[newIndex]?.error && attempts < sources.length) {
        newIndex = newIndex - 1
        if (newIndex < 0) newIndex = sources.length - 1
        attempts++
      }

      // Если все источники с ошибкой
      if (sources.every(s => s.error)) {
        return prev
      }

      return newIndex
    })
  }

  // Переключение на следующий источник
  const handleNext = () => {
    setCurrentIndex(prev => {
      let newIndex = prev + 1
      if (newIndex >= sources.length) newIndex = 0

      // Пропускаем источники с ошибкой
      let attempts = 0
      while (sources[newIndex]?.error && attempts < sources.length) {
        newIndex = newIndex + 1
        if (newIndex >= sources.length) newIndex = 0
        attempts++
      }

      // Если все источники с ошибкой
      if (sources.every(s => s.error)) {
        return prev
      }

      return newIndex
    })
  }

  // Обработка ошибки загрузки изображения
  const handleImageError = () => {
    setSources(prev => prev.map((s, i) => 
      i === currentIndex ? { ...s, error: true } : s
    ))
    
    // Авто-переключение на следующий источник через 1 секунду
    setTimeout(() => {
      handleNext()
    }, 1000)
  }

  const currentSource = sources[currentIndex]
  const hasMultipleSources = sources.filter(s => !s.error).length > 1
  
  // Если источников ещё нет - показываем загрузку
  if (sources.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-12 w-12 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <DialogHeader>
          <DialogTitle className="sr-only">
            Обложка {artistName}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Просмотр обложки артиста из различных источников
          </DialogDescription>
        </DialogHeader>
        
        {/* Заголовок */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">{artistName}</h2>
            <p className="text-sm text-muted-foreground">
              Источник: {currentSource?.name || 'Загрузка...'}
            </p>
          </div>
          {/* Крестик закрытия уже есть в Dialog по умолчанию */}
        </div>

        {/* Изображение */}
        <div className="relative aspect-square w-full bg-muted/50">
          {currentSource.loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            </div>
          ) : currentSource.url ? (
            <>
              {/* Основное изображение */}
              <img
                src={currentSource.url}
                alt={artistName}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-300",
                  currentSource.error && "opacity-0"
                )}
                onError={handleImageError}
              />
              
              {/* Кнопки переключения */}
              {hasMultipleSources && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full shadow-lg"
                    onClick={handlePrevious}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full shadow-lg"
                    onClick={handleNext}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 text-muted-foreground">
              <ImageOff className="h-16 w-16" />
              <p>Изображение не найдено</p>
            </div>
          )}
          
          {/* Индикаторы источников */}
          {hasMultipleSources && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {sources.map((source, index) => (
                <button
                  key={source.id}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    index === currentIndex
                      ? "bg-primary w-6"
                      : source.error
                        ? "bg-muted"
                        : "bg-primary/50 hover:bg-primary/70"
                  )}
                  onClick={() => !source.error && setCurrentIndex(index)}
                  disabled={source.error}
                />
              ))}
            </div>
          )}
        </div>

        {/* Информация */}
        <div className="p-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {sources.filter(s => !s.error).length} из {sources.length} источников
            </span>
            {currentSource.error && (
              <span className="text-destructive">Ошибка загрузки</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

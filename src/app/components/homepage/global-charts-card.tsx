/**
 * Карточка Global Charts (Last.fm топ треков)
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, Music, Loader2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent } from '@/app/components/ui/card'
import { lastFmService } from '@/service/lastfm-api'
import { subsonic } from '@/service/subsonic'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'

interface LastFmTrack {
  name: string
  artist: string
  mbid?: string
  url?: string
  image?: string
}

export function GlobalChartsCard() {
  const { t } = useTranslation()
  const { setSongList } = usePlayerActions()
  const [topTracks, setTopTracks] = useState<LastFmTrack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [libraryTracks, setLibraryTracks] = useState<any[]>([])

  // Загрузка топ треков из Last.fm
  useEffect(() => {
    const loadCharts = async () => {
      try {
        console.log('[GlobalCharts] Loading charts...')

        // Проверяем что Last.fm инициализирован
        const isInitialized = lastFmService.isInitialized()
        const hasApiKey = !!lastFmService.getApiKey()
        console.log('[GlobalCharts] Last.fm initialized:', isInitialized)
        console.log('[GlobalCharts] Last.fm has API key:', hasApiKey)

        if (!isInitialized || !hasApiKey) {
          console.warn('[GlobalCharts] Last.fm not configured, showing placeholder')
          // Не показываем ошибку, просто показываем что трек не найден
          setIsLoading(false)
          return
        }

        const tracks = await lastFmService.getGlobalTopTracks(20)
        console.log('[GlobalCharts] Loaded tracks:', tracks.length)
        setTopTracks(tracks)

        if (tracks.length === 0) {
          console.warn('[GlobalCharts] No tracks returned from Last.fm')
          setIsLoading(false)
          return
        }

        // Ищем эти треки в библиотеке
        const foundTracks: any[] = []
        for (const track of tracks.slice(0, 10)) {
          try {
            const searchQuery = `${track.artist} ${track.name}`
            console.log('[GlobalCharts] Searching:', searchQuery)

            const searchResults = await subsonic.search2({
              query: searchQuery,
              songCount: 1,
            })

            if (searchResults?.song?.[0]) {
              console.log('[GlobalCharts] Found:', searchResults.song[0].title)
              foundTracks.push(searchResults.song[0])
            }
          } catch (err) {
            console.warn('[GlobalCharts] Track not found in library:', track.name, track.artist)
          }
        }

        console.log('[GlobalCharts] Found tracks in library:', foundTracks.length)
        setLibraryTracks(foundTracks)
      } catch (error) {
        console.error('[GlobalCharts] Error loading:', error)
        // Не показываем toast ошибку, просто скрываем карточку
      } finally {
        setIsLoading(false)
      }
    }

    loadCharts()
  }, [])

  const handlePlayCharts = () => {
    if (libraryTracks.length > 0) {
      setSongList(libraryTracks, 0)
      toast(`▶️ Global Top ${libraryTracks.length}`, {
        type: 'default',
      })
    } else {
      toast('❌ Треки из чарта не найдены в библиотеке', {
        type: 'error',
      })
    }
  }

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardContent className="p-0">
        {/* Header с градиентом */}
        <div className="relative h-32 bg-gradient-to-br from-purple-600 via-pink-600 to-red-600 p-4">
          <div className="absolute inset-0 bg-black/20" />
          
          <div className="relative z-10 flex items-center justify-between h-full">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-white/90">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm font-medium">Last.fm</span>
              </div>
              
              <h3 className="text-2xl font-bold text-white">
                Global Top 50
              </h3>
              
              {isLoading ? (
                <div className="flex items-center gap-2 text-white/70">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Загрузка...</span>
                </div>
              ) : (
                <p className="text-xs text-white/70">
                  {libraryTracks.length} из {topTracks.length} в библиотеке
                </p>
              )}
            </div>
            
            <Music className="h-16 w-16 text-white/20" />
          </div>
        </div>

        {/* Кнопка Play */}
        <div className="p-4">
          <Button
            onClick={handlePlayCharts}
            disabled={isLoading || libraryTracks.length === 0}
            className="w-full"
            size="lg"
          >
            {libraryTracks.length > 0 ? (
              <>
                <Music className="h-4 w-4 mr-2" />
                Play Global Charts
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Поиск в библиотеке...
              </>
            )}
          </Button>
        </div>

        {/* Превью треков */}
        {libraryTracks.length > 0 && (
          <div className="px-4 pb-4">
            <div className="space-y-1">
              {libraryTracks.slice(0, 5).map((track, index) => (
                <div
                  key={track.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span className="text-purple-600 font-medium">#{index + 1}</span>
                  <span className="truncate flex-1">
                    {track.artist} - {track.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
